const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', '..', 'data');
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
};
for (const [column, sql] of Object.entries(migrations)) {
  if (!bookingColumns.includes(column)) db.exec(sql);
}

module.exports = db;
