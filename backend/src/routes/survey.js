const express = require('express');
const db = require('../db/connection');
const telegram = require('../services/telegram');

const router = express.Router();

// "YYYY-MM-DD" (как хранится в БД) -> "DD.MM.YYYY" для сообщений персоналу.
function formatDateRu(isoDate) {
  const [y, m, d] = String(isoDate).split('-');
  return y && m && d ? `${d}.${m}.${y}` : isoDate;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pageShell(title, bodyHtml) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — My Friends Pub Antalya</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@700&family=Inter:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    body{margin:0;min-height:100vh;background:#141210;color:#f5f2ee;font-family:'Inter',Arial,sans-serif;padding:20px;box-sizing:border-box;}
    .card{max-width:480px;margin:0 auto;background:#201d1a;border:1px solid #3a332d;border-radius:8px;padding:32px 24px;}
    h1{font-family:'Oswald',sans-serif;text-transform:uppercase;font-size:1.3rem;margin:0 0 8px;line-height:1.3;}
    p.sub{color:#b8b0a8;margin:0 0 24px;font-size:0.9rem;line-height:1.5;}
    fieldset{border:none;margin:0 0 22px;padding:0;}
    legend{font-weight:600;margin:0 0 10px;color:#f5f2ee;font-size:0.95rem;padding:0;}
    .stars{display:flex;gap:8px;}
    .stars input{position:absolute;opacity:0;width:1px;height:1px;}
    .stars label{flex:1;text-align:center;background:#2b2620;border:1px solid #3a332d;border-radius:6px;padding:12px 0;font-size:1.05rem;user-select:none;}
    .stars input:checked + label{background:#c0272d;border-color:#c0272d;}
    textarea{width:100%;box-sizing:border-box;background:#2b2620;border:1px solid #3a332d;border-radius:6px;color:#f5f2ee;padding:10px;font-family:inherit;font-size:0.95rem;min-height:90px;resize:vertical;}
    button{width:100%;margin-top:8px;background:#c0272d;color:#fff;border:none;border-radius:6px;padding:15px;font-size:1rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;}
    .error{color:#e0393f;margin:0 0 18px;font-size:0.9rem;}
  </style>
</head>
<body>
  <div class="card">${bodyHtml}</div>
</body>
</html>`;
}

function resultPage({ title, message, isError }) {
  return pageShell(title, `
    <h1 style="color:${isError ? '#e0393f' : '#f5f2ee'};">${title}</h1>
    <p class="sub" style="margin-bottom:0;">${message}</p>
  `);
}

function ratingFieldset(name, label) {
  const stars = [1, 2, 3, 4, 5].map((n) => `
    <input type="radio" id="${name}${n}" name="${name}" value="${n}" required />
    <label for="${name}${n}">${n}</label>
  `).join('');
  return `<fieldset><legend>${label}</legend><div class="stars">${stars}</div></fieldset>`;
}

function formPage({ event, token, error }) {
  return pageShell(`Как вам «${event.title}»?`, `
    <h1>Как вам «${escapeHtml(event.title)}»?</h1>
    <p class="sub">Оцените визит — это займёт минуту и правда помогает нам стать лучше.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="POST" action="/survey/${token}">
      ${ratingFieldset('service', 'Обслуживание')}
      ${ratingFieldset('food', 'Еда')}
      ${ratingFieldset('drinks', 'Напитки')}
      ${ratingFieldset('overall', 'Общее впечатление')}
      <fieldset>
        <legend>Пожелания / отзыв (необязательно)</legend>
        <textarea name="comment" maxlength="1000" placeholder="Что понравилось, что улучшить?"></textarea>
      </fieldset>
      <button type="submit">Отправить</button>
    </form>
  `);
}

router.get('/:token', (req, res) => {
  const survey = db.prepare('SELECT * FROM surveys WHERE token = ?').get(req.params.token);
  if (!survey) {
    return res.status(404).send(resultPage({ title: 'Ссылка не найдена', message: 'Возможно, она устарела или введена с ошибкой.', isError: true }));
  }
  if (survey.submitted_at) {
    return res.send(resultPage({ title: 'Спасибо!', message: 'Вы уже проходили этот опрос — мы всё получили 💛' }));
  }
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(survey.event_id);
  res.send(formPage({ event, token: survey.token }));
});

router.post('/:token', express.urlencoded({ extended: false }), async (req, res) => {
  const survey = db.prepare('SELECT * FROM surveys WHERE token = ?').get(req.params.token);
  if (!survey) {
    return res.status(404).send(resultPage({ title: 'Ссылка не найдена', message: 'Возможно, она устарела или введена с ошибкой.', isError: true }));
  }
  if (survey.submitted_at) {
    return res.send(resultPage({ title: 'Спасибо!', message: 'Вы уже проходили этот опрос — мы всё получили 💛' }));
  }

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(survey.event_id);
  const { service, food, drinks, overall, comment } = req.body || {};
  const ratings = [service, food, drinks, overall].map(Number);
  if (ratings.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) {
    return res.status(400).send(formPage({ event, token: survey.token, error: 'Поставьте оценку от 1 до 5 по каждому пункту.' }));
  }

  const cleanComment = String(comment || '').trim().slice(0, 1000);

  db.prepare(`
    UPDATE surveys SET submitted_at = datetime('now'),
      rating_service = ?, rating_food = ?, rating_drinks = ?, rating_overall = ?, comment = ?
    WHERE id = ?
  `).run(ratings[0], ratings[1], ratings[2], ratings[3], cleanComment, survey.id);

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(survey.booking_id);
  const staffChatId = process.env.TELEGRAM_STAFF_CHAT_ID;
  if (staffChatId) {
    await telegram.sendMessage(staffChatId,
      `#Опрос\n🎫 «${escapeHtml(event.title)}» · ${formatDateRu(event.event_date)}\n\n` +
      '<pre>' +
      `${telegram.ratingLine('Обслуживание', ratings[0])}\n` +
      `${telegram.ratingLine('Еда', ratings[1])}\n` +
      `${telegram.ratingLine('Напитки', ratings[2])}\n` +
      telegram.ratingLine('Общее впечатление', ratings[3]) +
      '</pre>'
    );
    if (cleanComment) {
      await telegram.sendMessage(staffChatId,
        '#отзыв\n' +
        `Мероприятие: «${escapeHtml(event.title)}», ${formatDateRu(event.event_date)}\n` +
        `Гость: ${escapeHtml(booking.customer_name)}\n` +
        `Отзыв: ${escapeHtml(cleanComment)}`
      );
    }
  }

  res.send(resultPage({ title: 'Спасибо!', message: 'Ваш отзыв поможет нам стать лучше 💛' }));
});

module.exports = router;
