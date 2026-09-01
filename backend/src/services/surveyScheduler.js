const crypto = require('crypto');
const db = require('../db/connection');
const telegram = require('./telegram');
const { getEmailService } = require('./email');

function surveyHoursAfterEvent() {
  return Number(process.env.SURVEY_HOURS_AFTER_EVENT || 18);
}

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
}

function eventDateTimeOf(row) {
  return new Date(`${row.event_date}T${row.event_time}:00+03:00`);
}

// Турция живёт по фиксированному UTC+3 без перехода на летнее время, так что
// прибавления трёх часов к серверному (UTC) времени достаточно, чтобы читать
// день недели/час по местным Анталийским часам.
function antalyaNow() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000);
}

function getKv(key) {
  const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
  return row ? row.value : null;
}
function setKv(key, value) {
  db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function surveyEmailHtml({ event, link, customerName }) {
  return `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><title>Как вам визит? — My Friends Pub Antalya</title></head>
<body style="margin:0;padding:24px;background:#1a1a1a;color:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#242424;border:1px solid #3a3a3a;border-radius:8px;overflow:hidden;">
    <div style="background:#c0272d;padding:16px 24px;">
      <h1 style="margin:0;font-size:20px;letter-spacing:1px;">MY FRIENDS PUB ANTALYA</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 8px;font-size:14px;color:#bbb;">Спасибо, что заглянули, ${customerName}!</p>
      <h2 style="margin:0 0 16px;font-size:20px;">Как вам «${event.title}»?</h2>
      <p style="margin:0 0 20px;color:#ccc;line-height:1.5;">Поделитесь впечатлением — это займёт минуту и правда помогает нам стать лучше.</p>
      <a href="${link}" style="display:inline-block;background:#c0272d;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;">Оценить визит</a>
    </div>
  </div>
</body>
</html>`;
}

function generateToken() {
  return crypto.randomBytes(12).toString('hex');
}

async function sendSurveyLink(booking, event) {
  const token = generateToken();
  db.prepare('INSERT INTO surveys (booking_id, event_id, token) VALUES (?, ?, ?)')
    .run(booking.id, event.id, token);

  const link = `${publicBaseUrl()}/survey/${token}`;

  if (booking.telegram_chat_id) {
    await telegram.sendMessage(booking.telegram_chat_id,
      `Спасибо, что заглянули на «<b>${escapeHtml(event.title)}</b>»! 🙌\n\n` +
      'Поделитесь впечатлением — это займёт минуту и правда помогает нам стать лучше.',
      telegram.urlButtonsRow([{ text: '📝 Оценить визит', url: link }])
    );
  } else {
    const emailService = getEmailService();
    await emailService.send({
      to: booking.customer_email,
      subject: `Как вам «${event.title}»? — My Friends Pub Antalya`,
      html: surveyEmailHtml({ event, link, customerName: booking.customer_name }),
    });
  }
}

// Находит оплаченные/подтверждённые брони, для которых прошло достаточно
// часов с начала мероприятия и опрос ещё не отправлялся, и рассылает ссылку.
async function sendDueSurveys() {
  if (!publicBaseUrl()) return;

  const bookings = db.prepare(`
    SELECT b.*, e.id as event_id, e.title as event_title,
           e.event_date as event_date, e.event_time as event_time
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    WHERE b.status = 'paid'
      AND NOT EXISTS (SELECT 1 FROM surveys s WHERE s.booking_id = b.id)
  `).all();

  const now = new Date();
  const threshold = surveyHoursAfterEvent();

  for (const booking of bookings) {
    const hoursSince = (now - eventDateTimeOf(booking)) / (1000 * 60 * 60);
    if (hoursSince < threshold) continue;

    const event = {
      id: booking.event_id,
      title: booking.event_title,
      event_date: booking.event_date,
      event_time: booking.event_time,
    };
    // eslint-disable-next-line no-await-in-loop
    await sendSurveyLink(booking, event);
  }
}

function pluralizeOtvet(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'ответ';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'ответа';
  return 'ответов';
}

async function sendWeeklySummary() {
  const staffChatId = process.env.TELEGRAM_STAFF_CHAT_ID;
  if (!staffChatId) return;

  const rows = db.prepare(`
    SELECT rating_service, rating_food, rating_drinks, rating_overall
    FROM surveys
    WHERE submitted_at IS NOT NULL AND submitted_at >= datetime('now', '-7 days')
  `).all();

  if (rows.length === 0) {
    await telegram.sendMessage(staffChatId, '#Опрос\nЗа прошедшую неделю новых оценок не поступало.');
    return;
  }

  const avg = (key) => rows.reduce((sum, r) => sum + r[key], 0) / rows.length;
  const avgLine = (label, key) => `${telegram.ratingLine(label, avg(key))} ${avg(key).toFixed(1)}`;

  await telegram.sendMessage(staffChatId,
    `#Опрос\n📊 Средняя оценка за неделю (${rows.length} ${pluralizeOtvet(rows.length)})\n\n` +
    '<pre>' +
    `${avgLine('Обслуживание', 'rating_service')}\n` +
    `${avgLine('Еда', 'rating_food')}\n` +
    `${avgLine('Напитки', 'rating_drinks')}\n` +
    avgLine('Общее впечатление', 'rating_overall') +
    '</pre>'
  );
}

// Раз в неделю (утро понедельника по Анталии) — сводка по всем опросам за
// последние 7 дней. Метка последней отправки лежит в kv_store, чтобы не
// продублировать сводку, если сервер за это трёхчасовое окно проснётся
// несколько раз (Render free tier).
async function maybeSendWeeklySummary() {
  const now = antalyaNow();
  const isMondayMorningWindow = now.getUTCDay() === 1 && now.getUTCHours() >= 9 && now.getUTCHours() < 12;
  if (!isMondayMorningWindow) return;

  const todayKey = now.toISOString().slice(0, 10);
  if (getKv('weekly_summary_last_sent') === todayKey) return;

  setKv('weekly_summary_last_sent', todayKey);
  await sendWeeklySummary();
}

function startSurveyScheduler() {
  setInterval(() => {
    sendDueSurveys().catch((err) => console.error('[surveys] error:', err));
    maybeSendWeeklySummary().catch((err) => console.error('[surveys] weekly summary error:', err));
  }, 10 * 60 * 1000);
}

module.exports = { startSurveyScheduler, sendDueSurveys, sendWeeklySummary };
