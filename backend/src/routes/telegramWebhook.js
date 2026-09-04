const express = require('express');
const db = require('../db/connection');
const telegram = require('../services/telegram');
const { broadcastSeatUpdate } = require('../ws/socket');
const { notifyWaitlist } = require('../services/waitlistNotifier');

const router = express.Router();

// Telegram шлёт сюда апдейты после setWebhook(). Нас интересует только
// сообщение "/start <token>" — это происходит один раз, когда гость
// нажимает кнопку "Подтвердить бронь в Telegram" на сайте и переходит в бота.
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // отвечаем сразу, Telegram не должен ждать нашу логику

  try {
    const message = req.body && req.body.message;
    if (!message || !message.text) return;

    const match = message.text.trim().match(/^\/start\s+(\S+)/);
    if (!match) return;

    const token = match[1];
    const chatId = message.chat && message.chat.id;
    if (!chatId) return;
    // Username нужен, чтобы персонал мог написать гостю напрямую при плохом
    // отзыве (см. survey.js) — у части пользователей Telegram его нет.
    const username = (message.from && message.from.username) || null;

    // Лист ожидания — необязательная привязка Telegram для мгновенных
    // уведомлений (см. waitlist.js), отличаем по префиксу токена.
    if (token.startsWith('wl_')) {
      const entry = db.prepare('SELECT * FROM waitlist WHERE telegram_link_token = ?').get(token);
      if (!entry) {
        await telegram.sendMessage(chatId, 'Не нашли лист ожидания по этой ссылке — возможно, она устарела.');
        return;
      }
      db.prepare('UPDATE waitlist SET telegram_chat_id = ? WHERE id = ?').run(String(chatId), entry.id);
      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(entry.event_id);
      await telegram.sendMessage(chatId,
        `Готово! Как только на «<b>${event.title}</b>» освободится место, напишем сюда первыми же. 👍`
      );
      return;
    }

    const booking = db.prepare('SELECT * FROM bookings WHERE telegram_link_token = ?').get(token);
    if (!booking) {
      await telegram.sendMessage(chatId, 'Не нашли бронь по этой ссылке — возможно, она уже истекла. Попробуйте забронировать заново на сайте.');
      return;
    }
    if (booking.status !== 'held') {
      // Уже подтверждена/просрочена/отменена — ничего не делаем повторно.
      return;
    }
    if (new Date(booking.hold_expires_at) < new Date()) {
      db.prepare("UPDATE bookings SET status = 'expired' WHERE id = ?").run(booking.id);
      broadcastSeatUpdate(booking.event_id);
      notifyWaitlist(booking.event_id).catch((err) => console.error('[waitlist] error:', err));
      await telegram.sendMessage(chatId, 'Время брони истекло, места уже не удержаны за вами. Забронируйте заново на сайте.');
      return;
    }

    db.prepare(
      "UPDATE bookings SET status = 'paid', paid_at = datetime('now'), telegram_chat_id = ?, telegram_username = ? WHERE id = ?"
    ).run(String(chatId), username, booking.id);

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(booking.event_id);
    const seats = db.prepare(`
      SELECT hs.table_label, hs.seat_number
      FROM booking_seats bs JOIN hall_seats hs ON hs.id = bs.seat_id
      WHERE bs.booking_id = ?
    `).all(booking.id);
    // Гостю бронируется весь столик целиком, а не отдельные места за ним —
    // поэтому в сообщении перечисляем только сами столики, без слова
    // «место»/номеров мест. У барных стульев номер важен (это отдельные
    // одноместные «столики»), у обычных столов — нет.
    const tableGroups = new Map();
    seats.forEach((s) => {
      if (!tableGroups.has(s.table_label)) tableGroups.set(s.table_label, []);
      tableGroups.get(s.table_label).push(s.seat_number);
    });
    const seatLabels = [...tableGroups.entries()]
      .map(([label, nums]) => (label === 'Бар' ? nums.map((n) => `Бар №${n}`).join(', ') : label))
      .join(', ');
    const arrivalLine = booking.arrival_time
      ? `🕒 Ждём вас в <b>${telegram.stylizeDigits(booking.arrival_time)}</b>\n`
      : '';
    // Спойлер (тап, чтобы раскрыть) — просили держать эту часть скрытой за
    // «пузырём», а не показывать сразу открытым текстом.
    const graceLine = booking.arrival_time
      ? `\n⏰ <tg-spoiler><b>Бронь держится ещё ${telegram.stylizeDigits('15')} минут</b> сверх названного времени.</tg-spoiler>\n`
      : '';

    const partySizeLine = booking.party_size
      ? `👥 Количество гостей: <b>${telegram.stylizeDigits(booking.party_size)}</b>\n`
      : '';

    await telegram.sendMessage(chatId,
      `Здравствуйте, ${booking.customer_name}! 👋\n\n` +
      `Ваша бронь на «<b>${event.title}</b>» принята.\n` +
      `📅 ${event.event_date} в <b>${telegram.stylizeDigits(event.event_time)}</b>\n` +
      `💺 ${seatLabels}\n` +
      partySizeLine +
      arrivalLine +
      graceLine +
      `\nВ день мероприятия пришлём сюда же напоминание — нужно будет подтвердить, что вы придёте, одним нажатием.`
    );

    broadcastSeatUpdate(booking.event_id);
  } catch (err) {
    console.error('[telegram webhook] error:', err);
  }
});

module.exports = router;
