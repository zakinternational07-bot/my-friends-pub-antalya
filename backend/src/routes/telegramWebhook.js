const express = require('express');
const db = require('../db/connection');
const telegram = require('../services/telegram');
const { broadcastSeatUpdate } = require('../ws/socket');

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
      await telegram.sendMessage(chatId, 'Время брони истекло, места уже не удержаны за вами. Забронируйте заново на сайте.');
      return;
    }

    db.prepare(
      "UPDATE bookings SET status = 'paid', paid_at = datetime('now'), telegram_chat_id = ? WHERE id = ?"
    ).run(String(chatId), booking.id);

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(booking.event_id);
    const seats = db.prepare(`
      SELECT hs.table_label, hs.seat_number
      FROM booking_seats bs JOIN hall_seats hs ON hs.id = bs.seat_id
      WHERE bs.booking_id = ?
    `).all(booking.id);
    const seatLabels = seats.map((s) => `${s.table_label}, место ${s.seat_number}`).join('; ');

    await telegram.sendMessage(chatId,
      `Здравствуйте, ${booking.customer_name}! 👋\n\n` +
      `Ваша бронь на «<b>${event.title}</b>» принята.\n` +
      `📅 ${event.event_date} в ${event.event_time}\n` +
      `💺 ${seatLabels}\n\n` +
      `В день мероприятия пришлём сюда же напоминание — нужно будет подтвердить, что вы придёте, одним нажатием.`
    );

    broadcastSeatUpdate(booking.event_id);
  } catch (err) {
    console.error('[telegram webhook] error:', err);
  }
});

module.exports = router;
