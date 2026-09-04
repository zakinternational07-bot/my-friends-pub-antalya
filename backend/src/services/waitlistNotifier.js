const db = require('../db/connection');
const telegram = require('./telegram');
const { getEmailService } = require('./email');

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
}

function formatDateRu(isoDate) {
  const [y, m, d] = String(isoDate).split('-');
  return y && m && d ? `${d}.${m}.${y}` : isoDate;
}

function waitlistEmailHtml({ event, bookingLink }) {
  return `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><title>Место освободилось — My Friends Pub Antalya</title></head>
<body style="margin:0;padding:24px;background:#1a1a1a;color:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#242424;border:1px solid #3a3a3a;border-radius:8px;overflow:hidden;">
    <div style="background:#c0272d;padding:16px 24px;">
      <h1 style="margin:0;font-size:20px;letter-spacing:1px;">MY FRIENDS PUB ANTALYA</h1>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 16px;font-size:20px;">Освободилось место на «${event.title}»! 🎉</h2>
      <p style="margin:0 0 20px;color:#ccc;line-height:1.5;">Вы в листе ожидания — бронирует тот, кто успеет первым, так что лучше поторопиться.</p>
      <a href="${bookingLink}" style="display:inline-block;background:#c0272d;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;">Забронировать столик</a>
    </div>
  </div>
</body>
</html>`;
}

// Уведомляет ВСЕХ ожидающих разом (не по очереди) — см. комментарий в
// schema.sql. Кулдаун нужен, чтобы серия быстрых событий (несколько
// освобождений подряд) не заспамила один и тот же список по нескольку раз.
const NOTIFY_COOLDOWN_MINUTES = 10;

async function notifyWaitlist(eventId) {
  const base = publicBaseUrl();
  if (!base) return;

  const rows = db.prepare(`
    SELECT * FROM waitlist
    WHERE event_id = ? AND status = 'waiting'
      AND (notified_at IS NULL OR notified_at <= datetime('now', '-${NOTIFY_COOLDOWN_MINUTES} minutes'))
  `).all(eventId);
  if (rows.length === 0) return;

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return;

  const bookingLink = `${base}/html/booking.html?event=${eventId}`;

  for (const row of rows) {
    const leaveLink = `${base}/waitlist/${row.leave_token}/leave`;
    // eslint-disable-next-line no-await-in-loop
    if (row.telegram_chat_id) {
      await telegram.sendMessage(row.telegram_chat_id,
        `Освободилось место на «<b>${event.title}</b>» (${formatDateRu(event.event_date)}, ${event.event_time})! 🎉\n\n` +
        'Вы в листе ожидания — бронирует тот, кто успеет первым.\n\n' +
        `<a href="${leaveLink}">Отписаться от уведомлений</a>`,
        telegram.urlButtonsRow([{ text: '💺 Забронировать столик', url: bookingLink }])
      );
    } else if (row.customer_email) {
      const emailService = getEmailService();
      // eslint-disable-next-line no-await-in-loop
      await emailService.send({
        to: row.customer_email,
        subject: `Место освободилось — ${event.title}`,
        html: waitlistEmailHtml({ event, bookingLink }),
      });
    }
    db.prepare("UPDATE waitlist SET notified_at = datetime('now') WHERE id = ?").run(row.id);
  }
}

module.exports = { notifyWaitlist };
