const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// На Render DATA_DIR указывает на смонтированный постоянный диск (см.
// render.yaml) — без него sqlite-файл живёт на эфемерном диске и пропадает
// при каждом деплое/долгом сне. Локально DATA_DIR не задан, используется
// обычная папка внутри проекта.
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'mfp.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// CREATE TABLE IF NOT EXISTS в schema.sql не добавляет колонки в уже
// существующую таблицу — на базах, созданных до Telegram-подтверждения
// броней, добавляем их здесь вручную, без потери данных.
const bookingColumns = db.prepare("PRAGMA table_info(bookings)").all().map((c) => c.name);
const migrations = {
  telegram_link_token: 'ALTER TABLE bookings ADD COLUMN telegram_link_token TEXT',
  telegram_chat_id: 'ALTER TABLE bookings ADD COLUMN telegram_chat_id TEXT',
  attendance_status: "ALTER TABLE bookings ADD COLUMN attendance_status TEXT NOT NULL DEFAULT 'pending'",
  reminder_sent_at: 'ALTER TABLE bookings ADD COLUMN reminder_sent_at TEXT',
  arrival_time: 'ALTER TABLE bookings ADD COLUMN arrival_time TEXT',
  reminder_count: 'ALTER TABLE bookings ADD COLUMN reminder_count INTEGER NOT NULL DEFAULT 0',
};
for (const [column, sql] of Object.entries(migrations)) {
  if (!bookingColumns.includes(column)) db.exec(sql);
}

// ВРЕМЕННЫЙ сид для проверки Telegram-напоминаний (кнопки "Подтверждаю" /
// "Не смогу прийти"). На бесплатном тарифе Render диск не сохраняется между
// деплоями, поэтому событие пересоздаётся здесь при каждом старте сервера.
// Удалить этот блок и тестовое мероприятие после того, как тест кнопок
// пройден.
const testEventSlug = 'test-reserve-2908';
if (!db.prepare('SELECT 1 FROM events WHERE slug = ?').get(testEventSlug)) {
  db.prepare(`INSERT INTO events
    (title, slug, event_date, event_time, price, description_short, description_long, poster_image, video_url)
    VALUES (?, ?, ?, ?, 0, ?, ?, '', '')`
  ).run(
    'TEST RESERVE',
    testEventSlug,
    '2026-08-29',
    '17:20',
    'Тестовое мероприятие для проверки Telegram-напоминаний',
    'Тестовое мероприятие для проверки Telegram-напоминаний'
  );
}

module.exports = db;
