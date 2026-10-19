const express = require('express');
const crypto = require('crypto');
const db = require('../db/connection');
const { computeHoldExpiryIso } = require('../services/seatHold');
const { generateBookingRef } = require('../services/bookingRef');
const { broadcastSeatUpdate } = require('../ws/socket');
const telegram = require('../services/telegram');

const router = express.Router();

router.post('/', (req, res) => {
  const { eventId, seatIds, name, email, arrivalTime, partySize, phone, wishes } = req.body || {};

  if (!eventId || !name || !arrivalTime || !partySize) {
    return res.status(400).json({ error: 'Заполните имя, время прихода и количество гостей' });
  }
  if (!/^\d{2}:\d{2}$/.test(arrivalTime)) {
    return res.status(400).json({ error: 'Некорректное время прихода' });
  }
  if (!Number.isInteger(Number(partySize)) || Number(partySize) < 1) {
    return res.status(400).json({ error: 'Некорректное количество гостей' });
  }

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'Мероприятие не найдено' });

  // Бесплатные мероприятия бронируются без схемы зала: гость оставляет
  // телефон и пожелания, а конкретный столик подбирает персонал. Платные
  // — как раньше: выбор мест на схеме, билет на почту.
  const isFree = event.price === 0;
  const customerPhone = String(phone || '').trim();
  const guestWishes = String(wishes || '').trim().slice(0, 500);

  if (isFree) {
    // Телефон — единственный способ связаться, если гость не дойдёт до бота.
    if (customerPhone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ error: 'Укажите телефон для связи' });
    }
  } else {
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({ error: 'Выберите хотя бы одно место' });
    }
    if (!email) return res.status(400).json({ error: 'Заполните email' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Некорректный email' });
    }
  }
  const customerEmail = isFree ? '' : email;
  const bookedSeatIds = isFree ? [] : seatIds;

  // На платных мероприятиях каждое место — отдельный билет, поэтому число
  // мест и число гостей — это одно и то же число (сайт так и присылает:
  // сколько стульев выбрали, столько и гостей, в том числе для компании
  // «5+»). На бесплатных столик бронируется целиком, и мест в нём обычно
  // больше, чем гостей, — там это правило не применяем.
  if (event.price > 0 && bookedSeatIds.length !== Number(partySize)) {
    return res.status(400).json({
      error: `Выберите ${partySize} ${Number(partySize) === 1 ? 'место' : 'мест'} — по одному на каждого гостя`,
    });
  }

  if (bookedSeatIds.length) {
    const validSeats = db.prepare(
      `SELECT id FROM hall_seats WHERE id IN (${bookedSeatIds.map(() => '?').join(',')})`
    ).all(...bookedSeatIds);
    if (validSeats.length !== bookedSeatIds.length) {
      return res.status(400).json({ error: 'Некоторые места не найдены' });
    }
  }

  try {
    const result = db.transaction(() => {
      const nowIso = new Date().toISOString();
      if (bookedSeatIds.length) {
        const taken = db.prepare(`
          SELECT bs.seat_id as seat_id
          FROM booking_seats bs
          JOIN bookings b ON b.id = bs.booking_id
          WHERE bs.event_id = ? AND bs.seat_id IN (${bookedSeatIds.map(() => '?').join(',')})
            AND (b.status = 'paid' OR (b.status = 'held' AND b.hold_expires_at > ?))
        `).all(eventId, ...bookedSeatIds, nowIso);

        if (taken.length > 0) {
          const err = new Error('SEATS_TAKEN');
          throw err;
        }
      }

      const bookingRef = generateBookingRef();
      const holdExpiresAt = computeHoldExpiryIso();
      const totalPrice = event.price * bookedSeatIds.length;
      const telegramLinkToken = crypto.randomBytes(16).toString('hex');

      const bookingInfo = db.prepare(`
        INSERT INTO bookings (event_id, booking_ref, customer_name, customer_email, status, total_price, hold_expires_at, telegram_link_token, arrival_time, party_size, customer_phone, guest_wishes)
        VALUES (?, ?, ?, ?, 'held', ?, ?, ?, ?, ?, ?, ?)
      `).run(eventId, bookingRef, name, customerEmail, totalPrice, holdExpiresAt, telegramLinkToken, arrivalTime, Number(partySize), customerPhone, guestWishes);

      const insertSeat = db.prepare(
        'INSERT INTO booking_seats (booking_id, seat_id, event_id) VALUES (?, ?, ?)'
      );
      bookedSeatIds.forEach((seatId) => insertSeat.run(bookingInfo.lastInsertRowid, seatId, eventId));

      return { bookingRef, holdExpiresAt, totalPrice, telegramLinkToken };
    })();

    broadcastSeatUpdate(eventId);
    res.status(201).json({
      bookingRef: result.bookingRef,
      holdExpiresAt: result.holdExpiresAt,
      totalPrice: result.totalPrice,
      // Бронь подтверждается только через Telegram. Билеты на платные
      // мероприятия продаёт внешняя площадка — своей оплаты у сайта нет.
      telegramUrl: isFree ? telegram.botDeepLink(result.telegramLinkToken) : null,
    });
  } catch (err) {
    if (err.message === 'SEATS_TAKEN') {
      return res.status(409).json({ error: 'Одно или несколько мест уже заняты, выберите другие' });
    }
    console.error(err);
    res.status(500).json({ error: 'Не удалось создать бронь' });
  }
});

router.get('/:ref', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref = ?').get(req.params.ref);
  if (!booking) return res.status(404).json({ error: 'Бронь не найдена' });
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(booking.event_id);
  const seats = db.prepare(`
    SELECT hs.table_label, hs.seat_number
    FROM booking_seats bs JOIN hall_seats hs ON hs.id = bs.seat_id
    WHERE bs.booking_id = ?
  `).all(booking.id);
  res.json({ booking, event, seats });
});

module.exports = router;
