const db = require('../db/connection');
const telegram = require('./telegram');
const { broadcastSeatUpdate } = require('../ws/socket');

// Три ступени для неподтверждённых Telegram-броней на бесплатные
// мероприятия: первое напоминание за N1 часов, второе (последний шанс) —
// за N2 часов, и если до сих пор нет ответа — за N3 часов бронь снимается
// автоматически, место освобождается на сайте.
function firstReminderHours() {
  return Number(process.env.REMINDER_HOURS_BEFORE || 12);
}
function secondReminderHours() {
  return Number(process.env.REMINDER_SECOND_HOURS_BEFORE || 6);
}
function autoCancelHours() {
  return Number(process.env.REMINDER_CANCEL_HOURS_BEFORE || 3);
}

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
}

function eventDateTimeOf(booking) {
  // event_date/event_time вводятся админом по местному времени Анталии
  // (UTC+3, в Турции нет перехода на летнее время) — без явного оффсета
  // Node трактовал бы "16:40" как UTC и ошибался на 3 часа.
  return new Date(`${booking.event_date}T${booking.event_time}:00+03:00`);
}

async function sendReminder(booking, stage) {
  const base = publicBaseUrl();
  const buttons = telegram.urlButtonsRow([
    { text: '✅ Подтверждаю', url: `${base}/rsvp/${booking.booking_ref}/confirm` },
    { text: '❌ Не смогу прийти', url: `${base}/rsvp/${booking.booking_ref}/decline` },
  ]);
  const intro = stage === 2
    ? 'Это последнее напоминание — пожалуйста, подтвердите бронь, иначе место придётся отдать другим гостям.'
    : 'Пожалуйста, подтвердите, что придёте — это займёт одно нажатие.';

  await telegram.sendMessage(booking.telegram_chat_id,
    `Напоминаем: сегодня в <b>${telegram.stylizeDigits(booking.event_time)}</b> у вас бронь на «<b>${booking.event_title}</b>» в My Friends Pub.\n\n${intro} 👇`,
    buttons
  );

  db.prepare("UPDATE bookings SET reminder_sent_at = datetime('now'), reminder_count = ? WHERE id = ?")
    .run(stage, booking.id);
}

async function autoCancelBooking(booking) {
  db.prepare("UPDATE bookings SET status = 'cancelled', attendance_status = 'expired' WHERE id = ?")
    .run(booking.id);
  broadcastSeatUpdate(booking.event_id);

  await telegram.sendMessage(booking.telegram_chat_id,
    `К сожалению, мы не получили подтверждение и бронь на «<b>${booking.event_title}</b>» автоматически снята — место передано другим гостям.\n` +
    `Будем рады видеть вас на другом мероприятии 💛`
  );

  const staffChatId = process.env.TELEGRAM_STAFF_CHAT_ID;
  if (staffChatId) {
    await telegram.sendMessage(staffChatId,
      `⚠️ Бронь автоматически отменена (нет ответа)\n«${booking.event_title}», ${booking.event_date} ${booking.event_time}\n${booking.customer_name}, бронь ${booking.booking_ref}`
    );
  }
}

// Находит подтверждённые Telegram-брони на бесплатные мероприятия, у
// которых ещё нет ответа гостя, и проводит их по ступеням в зависимости
// от того, сколько времени осталось до мероприятия.
async function sendDueReminders() {
  if (!telegram.isConfigured() || !publicBaseUrl()) return;

  const bookings = db.prepare(`
    SELECT b.*, e.title as event_title, e.event_date as event_date, e.event_time as event_time
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    WHERE b.status = 'paid'
      AND b.attendance_status = 'pending'
      AND b.telegram_chat_id IS NOT NULL
      AND e.price = 0
  `).all();

  const now = new Date();
  const cancelAt = autoCancelHours();
  const secondAt = secondReminderHours();
  const firstAt = firstReminderHours();

  for (const booking of bookings) {
    const hoursUntil = (eventDateTimeOf(booking) - now) / (1000 * 60 * 60);
    if (hoursUntil <= 0) continue; // мероприятие уже началось/прошло — не трогаем

    // eslint-disable-next-line no-await-in-loop
    if (hoursUntil <= cancelAt) {
      await autoCancelBooking(booking);
    } else if (hoursUntil <= secondAt && booking.reminder_count < 2) {
      await sendReminder(booking, 2);
    } else if (hoursUntil <= firstAt && booking.reminder_count < 1) {
      await sendReminder(booking, 1);
    }
  }
}

function startReminderScheduler() {
  // Раз в 10 минут — достаточно часто для окна в несколько часов, и не
  // спамит Telegram API. На бесплатном тарифе Render процесс "засыпает"
  // после простоя, так что шаг может уйти с опозданием (при следующем
  // визите на сайт, который его разбудит) — см. README.
  setInterval(() => {
    sendDueReminders().catch((err) => console.error('[reminders] error:', err));
  }, 10 * 60 * 1000);
}

module.exports = { startReminderScheduler, sendDueReminders };
