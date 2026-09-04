const express = require('express');
const db = require('../db/connection');
const telegram = require('../services/telegram');
const { broadcastSeatUpdate } = require('../ws/socket');
const { notifyWaitlist } = require('../services/waitlistNotifier');

const router = express.Router();

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resultPage({ title, message, isError }) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — My Friends Pub Antalya</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@700&family=Inter:wght@400;600&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#141210;color:#f5f2ee;font-family:'Inter',Arial,sans-serif;padding:20px;">
  <div style="max-width:420px;text-align:center;background:#201d1a;border:1px solid #3a332d;border-radius:8px;padding:36px 28px;">
    <h1 style="font-family:'Oswald',sans-serif;text-transform:uppercase;font-size:1.4rem;margin:0 0 16px;color:${isError ? '#e0393f' : '#f5f2ee'};">${title}</h1>
    <p style="color:#b8b0a8;line-height:1.5;margin:0;">${message}</p>
  </div>
</body>
</html>`;
}

// Ссылки из сообщения "Вы уже здесь?" (см. reminderScheduler.js) —
// открытие ссылки и есть ответ, без дополнительных действий на сайте.
router.get('/:ref/:action', async (req, res) => {
  const { ref, action } = req.params;
  if (action !== 'here' && action !== 'cancel') {
    return res.status(404).send(resultPage({ title: 'Не найдено', message: 'Некорректная ссылка.', isError: true }));
  }

  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref = ?').get(ref);
  if (!booking) {
    return res.status(404).send(resultPage({ title: 'Бронь не найдена', message: 'Возможно, ссылка устарела.', isError: true }));
  }

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(booking.event_id);

  if (booking.status !== 'paid') {
    return res.send(resultPage({
      title: 'Бронь больше не активна',
      message: 'Похоже, бронь уже была снята. Если это ошибка — напишите нам.',
      isError: true,
    }));
  }

  if (booking.arrival_confirmed_at) {
    return res.send(resultPage({ title: 'Уже подтверждено', message: 'Вы уже отметились — стол ждёт вас 🎉' }));
  }

  if (action === 'here') {
    db.prepare("UPDATE bookings SET arrival_confirmed_at = datetime('now') WHERE id = ?").run(booking.id);
    return res.send(resultPage({
      title: 'Отлично!',
      message: `Ждём вас за столиком на «${escapeHtml(event.title)}» — приятного вечера 🎉`,
    }));
  }

  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
  broadcastSeatUpdate(booking.event_id);
  notifyWaitlist(booking.event_id).catch((err) => console.error('[waitlist] error:', err));

  const staffChatId = process.env.TELEGRAM_STAFF_CHAT_ID;
  if (staffChatId) {
    await telegram.sendMessage(staffChatId,
      `❌ Бронь отменена гостем (не успевает)\n«${event.title}», ${event.event_date} ${event.event_time}\n${booking.customer_name}, бронь ${booking.booking_ref}`
    );
  }

  return res.send(resultPage({
    title: 'Бронь снята',
    message: 'Спасибо, что предупредили — место передано другим гостям. Будем рады видеть вас на другом мероприятии 💛',
  }));
});

module.exports = router;
