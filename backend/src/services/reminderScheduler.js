const db = require('../db/connection');
const telegram = require('./telegram');

function reminderHoursBefore() {
  return Number(process.env.REMINDER_HOURS_BEFORE || 6);
}

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
}

// Находит подтверждённые Telegram-брони на бесплатные мероприятия, до
// которых осталось не больше REMINDER_HOURS_BEFORE часов, и шлёт каждой
// напоминание с двумя кнопками-ссылками ("Подтверждаю" / "Не смогу
// прийти"), которые ведут на /rsvp/<ref>/confirm|decline на этом же сайте.
async function sendDueReminders() {
  if (!telegram.isConfigured() || !publicBaseUrl()) return;

  const bookings = db.prepare(`
    SELECT b.*, e.title as event_title, e.event_date as event_date, e.event_time as event_time
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    WHERE b.status = 'paid'
      AND b.telegram_chat_id IS NOT NULL
      AND b.reminder_sent_at IS NULL
      AND e.price = 0
  `).all();

  const now = new Date();
  const hoursThreshold = reminderHoursBefore();

  for (const booking of bookings) {
    // event_date/event_time вводятся админом по местному времени Анталии
    // (UTC+3, в Турции нет перехода на летнее время) — без явного оффсета
    // Node трактовал бы "16:40" как UTC и ошибался на 3 часа.
    const eventDateTime = new Date(`${booking.event_date}T${booking.event_time}:00+03:00`);
    const hoursUntil = (eventDateTime - now) / (1000 * 60 * 60);
    if (hoursUntil <= 0 || hoursUntil > hoursThreshold) continue;

    const base = publicBaseUrl();
    const buttons = telegram.urlButtonsRow([
      { text: '✅ Подтверждаю', url: `${base}/rsvp/${booking.booking_ref}/confirm` },
      { text: '❌ Не смогу прийти', url: `${base}/rsvp/${booking.booking_ref}/decline` },
    ]);

    // eslint-disable-next-line no-await-in-loop
    await telegram.sendMessage(booking.telegram_chat_id,
      `Напоминаем: сегодня в <b>${booking.event_time}</b> у вас бронь на «<b>${booking.event_title}</b>» в My Friends Pub.\n\n` +
      `Пожалуйста, подтвердите, что придёте — это займёт одно нажатие 👇`,
      buttons
    );

    db.prepare("UPDATE bookings SET reminder_sent_at = datetime('now') WHERE id = ?").run(booking.id);
  }
}

function startReminderScheduler() {
  // Раз в 10 минут — достаточно часто для окна в несколько часов, и не
  // спамит Telegram API. На бесплатном тарифе Render процесс "засыпает"
  // после простоя, так что напоминание может уйти с опозданием (при
  // следующем визите на сайт, который его разбудит) — см. README.
  setInterval(() => {
    sendDueReminders().catch((err) => console.error('[reminders] error:', err));
  }, 10 * 60 * 1000);
}

module.exports = { startReminderScheduler, sendDueReminders };
