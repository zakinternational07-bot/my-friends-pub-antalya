const express = require('express');
const crypto = require('crypto');
const db = require('../db/connection');
const { computeHoldExpiryIso } = require('../services/seatHold');
const { generateBookingRef } = require('../services/ticket');
const { broadcastSeatUpdate } = require('../ws/socket');
const telegram = require('../services/telegram');

const router = express.Router();

router.post('/', (req, res) => {
  const { eventId, seatIds, name, email, arrivalTime, partySize } = req.body || {};

  if (!eventId || !Array.isArray(seatIds) || seatIds.length === 0 || !name || !arrivalTime || !partySize) {
    return res.status(400).json({ error: 'Заполните имя, время прихода, количество гостей и выберите хотя бы одно место' });
  }
  if (!/^\d{2}:\d{2}$/.test(arrivalTime)) {
    return res.status(400).json({ error: 'Некорректное время прихода' });
  }
  if (!Number.isInteger(Number(partySize)) || Number(partySize) < 1) {
    return res.status(400).json({ error: 'Некорректное количество гостей' });
  }

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'Мероприятие не найдено' });

  // Билет на почту шлём только за платные брони — на бесплатных подтверждение
  // приходит в Telegram-бот, почта там не нужна и не запрашивается на сайте.
  const isFree = event.price === 0;
  if (!isFree) {
    if (!email) return res.status(400).json({ error: 'Заполните email' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Некорректный email' });
    }
  }
  const customerEmail = isFree ? '' : email;

  // На платных мероприятиях каждое место — отдельный билет, поэтому мест
  // должно быть ровно столько, сколько гостей. На бесплатных столик
  // бронируется целиком, и мест в нём обычно больше, чем гостей.
  if (event.price > 0 && seatIds.length !== Number(partySize)) {
    return res.status(400).json({
      error: `Выберите ${partySize} ${Number(partySize) === 1 ? 'место' : 'мест'} — по одному на каждого гостя`,
    });
  }

  const validSeats = db.prepare(
    `SELECT id FROM hall_seats WHERE id IN (${seatIds.map(() => '?').join(',')})`
  ).all(...seatIds);
  if (validSeats.length !== seatIds.length) {
    return res.status(400).json({ error: 'Некоторые места не найдены' });
  }

  try {
    const result = db.transaction(() => {
      const nowIso = new Date().toISOString();
      const taken = db.prepare(`
        SELECT bs.seat_id as seat_id
        FROM booking_seats bs
        JOIN bookings b ON b.id = bs.booking_id
        WHERE bs.event_id = ? AND bs.seat_id IN (${seatIds.map(() => '?').join(',')})
          AND (b.status = 'paid' OR (b.status = 'held' AND b.hold_expires_at > ?))
      `).all(eventId, ...seatIds, nowIso);

      if (taken.length > 0) {
        const err = new Error('SEATS_TAKEN');
        throw err;
      }

      const bookingRef = generateBookingRef();
      const holdExpiresAt = computeHoldExpiryIso();
      const totalPrice = event.price * seatIds.length;
      const telegramLinkToken = crypto.randomBytes(16).toString('hex');

      const bookingInfo = db.prepare(`
        INSERT INTO bookings (event_id, booking_ref, customer_name, customer_email, status, total_price, hold_expires_at, telegram_link_token, arrival_time, party_size)
        VALUES (?, ?, ?, ?, 'held', ?, ?, ?, ?, ?)
      `).run(eventId, bookingRef, name, customerEmail, totalPrice, holdExpiresAt, telegramLinkToken, arrivalTime, Number(partySize));

      const insertSeat = db.prepare(
        'INSERT INTO booking_seats (booking_id, seat_id, event_id) VALUES (?, ?, ?)'
      );
      seatIds.forEach((seatId) => insertSeat.run(bookingInfo.lastInsertRowid, seatId, eventId));

      return { bookingRef, holdExpiresAt, totalPrice, telegramLinkToken };
    })();

    broadcastSeatUpdate(eventId);
    res.status(201).json({
      bookingRef: result.bookingRef,
      holdExpiresAt: result.holdExpiresAt,
      totalPrice: result.totalPrice,
      paymentUrl: `/html/payment.html?booking=${result.bookingRef}`,
      // Для бесплатных мероприятий бронь подтверждается через Telegram, а
      // не через (тестовую) оплату — см. фронтенд booking.js.
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
