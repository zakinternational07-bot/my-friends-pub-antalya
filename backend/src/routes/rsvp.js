const express = require('express');
const db = require('../db/connection');
const telegram = require('../services/telegram');
const { broadcastSeatUpdate } = require('../ws/socket');

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

// Ссылки из напоминания в день мероприятия ("✅ Подтверждаю" / "❌ Не смогу
// прийти") ведут прямо сюда — само открытие ссылки и есть подтверждение,
// никаких дополнительных действий на сайте от гостя не требуется.
router.get('/:ref/:action', async (req, res) => {
  const { ref, action } = req.params;
  if (action !== 'confirm' && action !== 'decline') {
    return res.status(404).send(resultPage({ title: 'Не найдено', message: 'Некорректная ссылка.', isError: true }));
  }

  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref = ?').get(ref);
  if (!booking) {
    return res.status(404).send(resultPage({ title: 'Бронь не найдена', message: 'Возможно, ссылка устарела.', isError: true }));
  }

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(booking.event_id);

  // Повторное нажатие той же кнопки не должно ломаться — просто ещё раз
  // показываем результат, без повторных уведомлений. Отдельно: гость мог
  // уже подтвердить приход раньше, а потом передумать на переспросе
  // ближе к мероприятию (см. reminderScheduler.js sendRecheck) — decline
  // с состояния "confirmed" тоже обрабатываем, а не только с "pending".
  const wasReconfirm = booking.attendance_status === 'confirmed';
  if (booking.attendance_status === 'pending' || (wasReconfirm && action === 'decline')) {
    db.prepare('UPDATE bookings SET attendance_status = ? WHERE id = ?')
      .run(action === 'confirm' ? 'confirmed' : 'declined', booking.id);
    booking.attendance_status = action === 'confirm' ? 'confirmed' : 'declined';

    if (action === 'decline') {
      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
      broadcastSeatUpdate(booking.event_id);

      const staffChatId = process.env.TELEGRAM_STAFF_CHAT_ID;
      if (staffChatId) {
        await telegram.sendMessage(staffChatId,
          `❌ Бронь отменена гостем${wasReconfirm ? ' (передумал после подтверждения)' : ''}\n«${event.title}», ${event.event_date} ${event.event_time}\n${booking.customer_name}, бронь ${booking.booking_ref}`
        );
      }
    }
  }

  // Отвечаем по РЕАЛЬНОМУ статусу брони, а не по нажатой кнопке — если
  // гость опоздал с ответом и бронь уже сгорела автоматически (см.
  // reminderScheduler.js), нельзя показывать «Подтверждено», хотя место
  // уже отдали.
  if (booking.attendance_status === 'expired') {
    return res.send(resultPage({
      title: 'Бронь больше не активна',
      message: 'Мы не получили ответ вовремя, и место уже освободили для других гостей. Будем рады видеть вас на другом мероприятии 💛',
      isError: true,
    }));
  }

  if (booking.attendance_status === 'confirmed') {
    return res.send(resultPage({
      title: 'Бронь подтверждена',
      message: `Спасибо! Ждём вас сегодня в ${escapeHtml(event.event_time)} на «${escapeHtml(event.title)}» 🎉`,
    }));
  }

  return res.send(resultPage({
    title: 'Жаль, что не получится',
    message: 'Мы освободили место для других гостей. Будем рады видеть вас на следующем мероприятии 💛',
  }));
});

module.exports = router;
