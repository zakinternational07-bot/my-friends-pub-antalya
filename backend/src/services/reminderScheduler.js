const db = require('../db/connection');
const telegram = require('./telegram');
const { broadcastSeatUpdate } = require('../ws/socket');
const { notifyWaitlist } = require('./waitlistNotifier');
const { getEmailService } = require('./email');

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
// Проверка явки: ровно в момент начала мероприятия спрашиваем подтверждённых
// гостей «Вы уже здесь?» и, если тишина дольше этого времени — снимаем бронь.
function arrivalCheckGraceMinutes() {
  return Number(process.env.ARRIVAL_CHECK_GRACE_MINUTES || 15);
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

function noShowCancelEmailHtml({ eventTitle }) {
  return `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><title>Бронь снята — My Friends Pub Antalya</title></head>
<body style="margin:0;padding:24px;background:#1a1a1a;color:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#242424;border:1px solid #3a3a3a;border-radius:8px;overflow:hidden;">
    <div style="background:#c0272d;padding:16px 24px;">
      <h1 style="margin:0;font-size:20px;letter-spacing:1px;">MY FRIENDS PUB ANTALYA</h1>
    </div>
    <div style="padding:24px;">
      <blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #c0272d;background:#1e1e1e;font-style:italic;color:#ddd;line-height:1.5;">
        «Мы вас ждали, час пробил,<br>Только гость не приходил.<br>Стол пришлось, увы, отдать —<br>Будем рады вновь принять!»
      </blockquote>
      <p style="margin:0;color:#ccc;line-height:1.5;">Ваша бронь на «${eventTitle}» снята из-за отсутствия подтверждения — место передано другим гостям. Будем рады видеть вас на другом мероприятии 💛</p>
    </div>
  </div>
</body>
</html>`;
}

// Одно сообщение: сначала четверостишье в оформлении цитаты (blockquote +
// кавычки-«ёлочки» + моноширинный <code> — выбрали этот вариант вместо
// курсива, чтобы сильнее выделялось на фоне остального текста), потом
// тем же сообщением — то же самое понятным языком, без стихов. Общая для
// обоих сценариев автоотмены: не ответили до мероприятия и не отметились
// после его начала. Telegram, если бронь подтверждали через бота, иначе
// email — платные брони Telegram вообще не привязывают.
async function sendNoShowCancelNotice(booking) {
  if (booking.telegram_chat_id) {
    await telegram.sendMessage(booking.telegram_chat_id,
      '<blockquote><code>«Мы вас ждали, час пробил,\n' +
      'Только гость не приходил.\n' +
      'Стол пришлось, увы, отдать —\n' +
      'Будем рады вновь принять!»</code></blockquote>\n\n' +
      `Ваша бронь на «<b>${booking.event_title}</b>» снята из-за отсутствия подтверждения — место передано другим гостям.\n` +
      'Будем рады видеть вас на другом мероприятии 💛'
    );
  } else if (booking.customer_email) {
    const emailService = getEmailService();
    await emailService.send({
      to: booking.customer_email,
      subject: `Бронь снята — ${booking.event_title}`,
      html: noShowCancelEmailHtml({ eventTitle: booking.event_title }),
    });
  }
}

async function autoCancelBooking(booking) {
  db.prepare("UPDATE bookings SET status = 'cancelled', attendance_status = 'expired' WHERE id = ?")
    .run(booking.id);
  broadcastSeatUpdate(booking.event_id);
  notifyWaitlist(booking.event_id).catch((err) => console.error('[waitlist] error:', err));

  await sendNoShowCancelNotice(booking);

  const staffChatId = process.env.TELEGRAM_STAFF_CHAT_ID;
  if (staffChatId) {
    await telegram.sendMessage(staffChatId,
      `⚠️ Бронь автоматически отменена (нет ответа)\n«${booking.event_title}», ${booking.event_date} ${booking.event_time}\n${booking.customer_name}, бронь ${booking.booking_ref}`
    );
  }
}

function arrivalCheckEmailHtml({ eventTitle, hereUrl, cancelUrl, graceMinutes }) {
  return `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><title>Вы уже здесь? — My Friends Pub Antalya</title></head>
<body style="margin:0;padding:24px;background:#1a1a1a;color:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#242424;border:1px solid #3a3a3a;border-radius:8px;overflow:hidden;">
    <div style="background:#c0272d;padding:16px 24px;">
      <h1 style="margin:0;font-size:20px;letter-spacing:1px;">MY FRIENDS PUB ANTALYA</h1>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 16px;font-size:20px;">Мероприятие «${eventTitle}» уже началось — вы с нами?</h2>
      <p style="margin:0 0 20px;color:#ccc;line-height:1.5;">Если не ответите в течение ${graceMinutes} минут, столик придётся отдать другим гостям.</p>
      <a href="${hereUrl}" style="display:inline-block;background:#c0272d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;margin:0 10px 10px 0;">✅ Я уже здесь</a>
      <a href="${cancelUrl}" style="display:inline-block;background:#3a3a3a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;">❌ Не успею</a>
    </div>
  </div>
</body>
</html>`;
}

// В момент начала мероприятия спрашиваем гостей «Вы уже здесь?» — двумя
// кнопками-ссылками (см. arrival.js). Telegram, если бронь подтверждали
// через бота (бесплатные события), иначе email — так добираемся и до
// платных броней, для которых Telegram вообще не привязывается.
async function sendArrivalCheck(booking) {
  const base = publicBaseUrl();
  const hereUrl = `${base}/arrival/${booking.booking_ref}/here`;
  const cancelUrl = `${base}/arrival/${booking.booking_ref}/cancel`;
  const graceMinutes = String(arrivalCheckGraceMinutes());

  if (booking.telegram_chat_id) {
    const buttons = telegram.urlButtonsRow([
      { text: '✅ Я уже здесь', url: hereUrl },
      { text: '❌ Не успею', url: cancelUrl },
    ]);
    await telegram.sendMessage(booking.telegram_chat_id,
      `Мероприятие «<b>${booking.event_title}</b>» уже началось — вы с нами? 👇\n\n` +
      `<tg-spoiler>Если не ответите в течение ${telegram.stylizeDigits(graceMinutes)} минут, столик придётся отдать другим гостям.</tg-spoiler>`,
      buttons
    );
  } else if (booking.customer_email) {
    const emailService = getEmailService();
    await emailService.send({
      to: booking.customer_email,
      subject: `Вы уже здесь? — ${booking.event_title}`,
      html: arrivalCheckEmailHtml({ eventTitle: booking.event_title, hereUrl, cancelUrl, graceMinutes }),
    });
  }

  db.prepare("UPDATE bookings SET arrival_check_sent_at = datetime('now') WHERE id = ?").run(booking.id);
}

// Все оплаченные брони (платные и бесплатные), для которых мероприятие уже
// началось, а вопрос «Вы уже здесь?» ещё не отправляли.
async function sendDueArrivalChecks() {
  if (!publicBaseUrl()) return;

  const bookings = db.prepare(`
    SELECT b.*, e.title as event_title, e.event_date as event_date, e.event_time as event_time
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    WHERE b.status = 'paid'
      AND b.arrival_check_sent_at IS NULL
  `).all();

  const now = new Date();
  for (const booking of bookings) {
    if (eventDateTimeOf(booking) <= now) {
      // eslint-disable-next-line no-await-in-loop
      await sendArrivalCheck(booking);
    }
  }
}

// Если после вопроса «Вы уже здесь?» прошло больше ARRIVAL_CHECK_GRACE_MINUTES
// минут, а гость так и не отметился (ни «здесь», ни «не успею») — снимаем
// бронь сами. Сравнение времени — на стороне SQL (datetime('now', ...)),
// а не через new Date() в JS: sqlite отдаёт UTC-строку без суффикса "Z", и
// JS-парсер трактует такую строку как локальное время процесса, а не UTC.
async function autoReleaseNoShows() {
  const graceMinutes = arrivalCheckGraceMinutes();
  const bookings = db.prepare(`
    SELECT b.*, e.title as event_title, e.event_date as event_date, e.event_time as event_time
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    WHERE b.status = 'paid'
      AND b.arrival_check_sent_at IS NOT NULL
      AND b.arrival_confirmed_at IS NULL
      AND b.arrival_check_sent_at <= datetime('now', '-${graceMinutes} minutes')
  `).all();

  for (const booking of bookings) {
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
    broadcastSeatUpdate(booking.event_id);
    notifyWaitlist(booking.event_id).catch((err) => console.error('[waitlist] error:', err));

    // eslint-disable-next-line no-await-in-loop
    await sendNoShowCancelNotice(booking);

    const staffChatId = process.env.TELEGRAM_STAFF_CHAT_ID;
    if (staffChatId) {
      // eslint-disable-next-line no-await-in-loop
      await telegram.sendMessage(staffChatId,
        `⚠️ Бронь автоматически снята (гость не отметился после начала)\n«${booking.event_title}», ${booking.event_date} ${booking.event_time}\n${booking.customer_name}, бронь ${booking.booking_ref}`
      );
    }
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
    sendDueArrivalChecks().catch((err) => console.error('[arrival] error:', err));
    autoReleaseNoShows().catch((err) => console.error('[arrival] error:', err));
  }, 10 * 60 * 1000);
}

module.exports = { startReminderScheduler, sendDueReminders, sendDueArrivalChecks, autoReleaseNoShows };
