const db = require('../db/connection');
const telegram = require('./telegram');
const { broadcastSeatUpdate } = require('../ws/socket');
const { notifyWaitlist } = require('./waitlistNotifier');

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
// Планы у людей меняются даже после того, как они уже подтвердили приход —
// поэтому тех, кто ответил "да" на одно из напоминаний выше, ближе к
// мероприятию переспрашиваем ещё раз, отдельным (третьим) сценарием.
function recheckHours() {
  return Number(process.env.REMINDER_RECHECK_HOURS_BEFORE || 4);
}
// Проверка явки: ровно в момент начала мероприятия спрашиваем подтверждённых
// гостей «Вы уже здесь?» и, если тишина дольше этого времени — снимаем бронь.
function arrivalCheckGraceMinutes() {
  return Number(process.env.ARRIVAL_CHECK_GRACE_MINUTES || 30);
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

// Третья ветка (см. sendDueReminders): гость подтвердил на самом первом,
// 12-часовом напоминании — до мероприятия ещё далеко, планы вполне могут
// поменяться, поэтому переспрашиваем один раз тем же вопросом с теми же
// кнопками. Тех, кто подтвердил уже на 6-часовом "последнем шансе", сюда
// не зовём (см. фильтр reminder_count в sendDueReminders) — до
// мероприятия и так остаётся немного, лишний раз дёргать незачем.
// reminder_count поднимаем до 3, чтобы не спросить дважды.
async function sendRecheck(booking) {
  const base = publicBaseUrl();
  const buttons = telegram.urlButtonsRow([
    { text: '✅ Подтверждаю', url: `${base}/rsvp/${booking.booking_ref}/confirm` },
    { text: '❌ Не смогу прийти', url: `${base}/rsvp/${booking.booking_ref}/decline` },
  ]);

  await telegram.sendMessage(booking.telegram_chat_id,
    `Спрашиваем ещё раз: вы всё ещё придёте сегодня в <b>${telegram.stylizeDigits(booking.event_time)}</b> на «<b>${booking.event_title}</b>»? Может быть, планы поменялись? 👇`,
    buttons
  );

  db.prepare("UPDATE bookings SET reminder_sent_at = datetime('now'), reminder_count = 3 WHERE id = ?")
    .run(booking.id);
}

// Одно сообщение: сначала четверостишье в оформлении цитаты (blockquote +
// кавычки-«ёлочки» + моноширинный <code> — выбрали этот вариант вместо
// курсива, чтобы сильнее выделялось на фоне остального текста), потом
// тем же сообщением — то же самое понятным языком, без стихов. Общая для
// обоих сценариев автоотмены: не ответили до мероприятия и не отметились
// после его начала.
async function sendNoShowCancelNotice(chatId, eventTitle) {
  await telegram.sendMessage(chatId,
    '<blockquote><code>«Мы вас ждали, час пробил,\n' +
    'Только гость не приходил.\n' +
    'Стол пришлось, увы, отдать —\n' +
    'Будем рады вновь принять!»</code></blockquote>\n\n' +
    `Ваша бронь на «<b>${eventTitle}</b>» снята из-за отсутствия подтверждения — место передано другим гостям.\n` +
    'Будем рады видеть вас на другом мероприятии 💛'
  );
}

async function autoCancelBooking(booking) {
  db.prepare("UPDATE bookings SET status = 'cancelled', attendance_status = 'expired' WHERE id = ?")
    .run(booking.id);
  broadcastSeatUpdate(booking.event_id);
  notifyWaitlist(booking.event_id).catch((err) => console.error('[waitlist] error:', err));

  await sendNoShowCancelNotice(booking.telegram_chat_id, booking.event_title);

  const staffChatId = process.env.TELEGRAM_STAFF_CHAT_ID;
  if (staffChatId) {
    await telegram.sendMessage(staffChatId,
      `⚠️ Бронь автоматически отменена (нет ответа)\n«${booking.event_title}», ${booking.event_date} ${booking.event_time}\n${booking.customer_name}, бронь ${booking.booking_ref}`
    );
  }
}

// В момент начала мероприятия спрашиваем гостей, подтвердивших бронь через
// бота, «Вы уже здесь?» — двумя кнопками-ссылками, как и остальные
// подтверждения (см. arrival.js).
async function sendArrivalCheck(booking) {
  const base = publicBaseUrl();
  const buttons = telegram.urlButtonsRow([
    { text: '✅ Я уже здесь', url: `${base}/arrival/${booking.booking_ref}/here` },
    { text: '❌ Не успею', url: `${base}/arrival/${booking.booking_ref}/cancel` },
  ]);
  const graceMinutes = String(arrivalCheckGraceMinutes());

  await telegram.sendMessage(booking.telegram_chat_id,
    `Мероприятие «<b>${booking.event_title}</b>» уже началось — вы с нами? 👇\n\n` +
    `<tg-spoiler>Если не ответите в течение ${telegram.stylizeDigits(graceMinutes)} минут, столик придётся отдать другим гостям.</tg-spoiler>`,
    buttons
  );

  db.prepare("UPDATE bookings SET arrival_check_sent_at = datetime('now') WHERE id = ?").run(booking.id);
}

// Оплаченные/подтверждённые Telegram-брони, для которых мероприятие уже
// началось, а вопрос «Вы уже здесь?» ещё не отправляли.
async function sendDueArrivalChecks() {
  if (!telegram.isConfigured() || !publicBaseUrl()) return;

  const bookings = db.prepare(`
    SELECT b.*, e.title as event_title, e.event_date as event_date, e.event_time as event_time
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    WHERE b.status = 'paid'
      AND b.telegram_chat_id IS NOT NULL
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
    await sendNoShowCancelNotice(booking.telegram_chat_id, booking.event_title);

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
// от того, сколько времени осталось до мероприятия. Ветка 1 (эта функция,
// bookings ниже): гость так и не ответил ни на одно напоминание — сначала
// два напоминания, потом автоотмена. Ветка 3 (bookingsToRecheck): гость
// уже подтвердил приход раньше, но ближе к мероприятию его переспрашивают
// ещё раз на случай, если планы поменялись.
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

  // Переспрашиваем только тех, кто подтвердил на самом первом (12-часовом)
  // напоминании (reminder_count = 1 на момент подтверждения) — если гость
  // тянул с ответом до 6-часового "последнего шанса" и всё же подтвердил,
  // до мероприятия и так осталось немного: дёргать его ещё раз ближе к
  // началу было бы лишним и раздражало бы гостей. reminder_count < 2
  // (а не < 3, как для самого переспроса) как раз и отсекает этот случай.
  const bookingsToRecheck = db.prepare(`
    SELECT b.*, e.title as event_title, e.event_date as event_date, e.event_time as event_time
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    WHERE b.status = 'paid'
      AND b.attendance_status = 'confirmed'
      AND b.telegram_chat_id IS NOT NULL
      AND e.price = 0
      AND b.reminder_count < 2
  `).all();

  const recheckAt = recheckHours();
  for (const booking of bookingsToRecheck) {
    const hoursUntil = (eventDateTimeOf(booking) - now) / (1000 * 60 * 60);
    if (hoursUntil <= 0 || hoursUntil > recheckAt) continue;
    // eslint-disable-next-line no-await-in-loop
    await sendRecheck(booking);
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
