const express = require('express');
const db = require('../db/connection');

const router = express.Router();

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

// Ссылка "Отписаться от уведомлений" в сообщениях листа ожидания
// (waitlistNotifier.js) — само открытие ссылки и есть отписка.
router.get('/:token/leave', (req, res) => {
  const entry = db.prepare('SELECT * FROM waitlist WHERE leave_token = ?').get(req.params.token);
  if (!entry) {
    return res.status(404).send(resultPage({ title: 'Ссылка не найдена', message: 'Возможно, она устарела или введена с ошибкой.', isError: true }));
  }
  if (entry.status !== 'left') {
    db.prepare("UPDATE waitlist SET status = 'left' WHERE id = ?").run(entry.id);
  }
  res.send(resultPage({ title: 'Вы отписаны', message: 'Больше не будем присылать уведомления об этом мероприятии. Если передумаете — можно снова встать в лист ожидания на сайте.' }));
});

module.exports = router;
