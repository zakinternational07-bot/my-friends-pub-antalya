CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  event_date TEXT NOT NULL,       -- YYYY-MM-DD
  event_time TEXT NOT NULL,       -- HH:MM
  price REAL NOT NULL DEFAULT 0,
  description_short TEXT NOT NULL DEFAULT '',
  description_long TEXT NOT NULL DEFAULT '',
  poster_image TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ru TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_tr TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name_ru TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_tr TEXT NOT NULL,
  description_ru TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  description_tr TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hall_seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_label TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  pos_x REAL NOT NULL,
  pos_y REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  booking_ref TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'held', -- held | paid | expired | cancelled
  total_price REAL NOT NULL DEFAULT 0,
  hold_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT,
  -- Telegram-подтверждение брони на бесплатные мероприятия (см. connection.js
  -- для миграции этих колонок на уже существующих базах).
  telegram_link_token TEXT UNIQUE,   -- payload в t.me/<bot>?start=<token>
  telegram_chat_id TEXT,             -- chat_id, полученный после /start
  attendance_status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | declined
  reminder_sent_at TEXT              -- когда отправили напоминание в день мероприятия
);

CREATE TABLE IF NOT EXISTS booking_seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seat_id INTEGER NOT NULL REFERENCES hall_seats(id),
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_booking_seats_event ON booking_seats(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
