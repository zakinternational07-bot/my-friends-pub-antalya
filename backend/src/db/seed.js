require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const bcrypt = require('bcryptjs');
const db = require('./connection');

function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'change-me';
  const hash = bcrypt.hashSync(password, 10);
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (existing) {
    db.prepare('UPDATE admins SET password_hash = ? WHERE username = ?').run(hash, username);
  } else {
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash);
  }
  console.log(`[seed] admin user ready: ${username}`);
}

// Generates seats laid out in a short arc/row around a table center so the
// hall map has a readable, non-overlapping layout.
function tableSeats(tableLabel, centerX, centerY, count, radius = 4.5) {
  const seats = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    seats.push({
      table_label: tableLabel,
      seat_number: i + 1,
      pos_x: Math.round((centerX + radius * Math.cos(angle)) * 100) / 100,
      pos_y: Math.round((centerY + radius * Math.sin(angle)) * 100) / 100,
    });
  }
  return seats;
}

function seedHall() {
  const count = db.prepare('SELECT COUNT(*) as c FROM hall_seats').get().c;
  if (count > 0) {
    console.log('[seed] hall layout already present, skipping');
    return;
  }
  const layout = [
    ...tableSeats('Стол 1', 18, 20, 4),
    ...tableSeats('Стол 2', 50, 20, 4),
    ...tableSeats('Стол 3', 82, 20, 2),
    ...tableSeats('Стол 4', 18, 55, 2),
    ...tableSeats('VIP-диван', 50, 55, 6, 7),
    ...tableSeats('Стол 6', 82, 55, 4),
    ...tableSeats('Барная стойка', 50, 85, 6, 22),
  ];
  const insert = db.prepare(
    'INSERT INTO hall_seats (table_label, seat_number, pos_x, pos_y) VALUES (@table_label, @seat_number, @pos_x, @pos_y)'
  );
  const insertMany = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
  insertMany(layout);
  console.log(`[seed] hall layout seeded: ${layout.length} seats`);
}

function seedMenu() {
  const count = db.prepare('SELECT COUNT(*) as c FROM menu_categories').get().c;
  if (count > 0) {
    console.log('[seed] menu already present, skipping');
    return;
  }
  const categories = [
    { name_ru: 'Закуски', name_en: 'Starters', name_tr: 'Başlangıçlar', sort_order: 1,
      items: [
        { name_ru: 'Начос с сыром', name_en: 'Cheese nachos', name_tr: 'Peynirli nachos',
          description_ru: 'Кукурузные чипсы, чеддер, халапеньо, сальса', description_en: 'Corn chips, cheddar, jalapeño, salsa', description_tr: 'Mısır cipsi, cheddar, jalapeno, salsa',
          price: 320 },
        { name_ru: 'Крылышки BBQ', name_en: 'BBQ wings', name_tr: 'BBQ kanat',
          description_ru: '8 шт, соус барбекю, сельдерей', description_en: '8 pcs, BBQ sauce, celery', description_tr: '8 adet, BBQ sos, kereviz',
          price: 380 },
      ] },
    { name_ru: 'Горячее', name_en: 'Mains', name_tr: 'Ana Yemekler', sort_order: 2,
      items: [
        { name_ru: 'Бургер Friends', name_en: 'Friends Burger', name_tr: 'Friends Burger',
          description_ru: 'Говядина, чеддер, бекон, картофель фри', description_en: 'Beef, cheddar, bacon, fries', description_tr: 'Dana eti, cheddar, jambon, patates kızartması',
          price: 450 },
        { name_ru: 'Фиш энд чипс', name_en: 'Fish & chips', name_tr: 'Fish & chips',
          description_ru: 'Треска в темном пиве, картофель фри, соус тартар', description_en: 'Beer-battered cod, fries, tartar sauce', description_tr: 'Biralı morina, patates kızartması, tartar sos',
          price: 420 },
      ] },
    { name_ru: 'Напитки', name_en: 'Drinks', name_tr: 'İçecekler', sort_order: 3,
      items: [
        { name_ru: 'Разливное пиво 0.5', name_en: 'Draft beer 0.5L', name_tr: 'Fıçı bira 0.5L',
          description_ru: '', description_en: '', description_tr: '', price: 220 },
        { name_ru: 'Коктейль Old Fashioned', name_en: 'Old Fashioned', name_tr: 'Old Fashioned',
          description_ru: 'Бурбон, биттер, апельсин', description_en: 'Bourbon, bitters, orange', description_tr: 'Burbon, bitter, portakal', price: 480 },
      ] },
  ];

  const insertCat = db.prepare(
    'INSERT INTO menu_categories (name_ru, name_en, name_tr, sort_order) VALUES (@name_ru, @name_en, @name_tr, @sort_order)'
  );
  const insertItem = db.prepare(`INSERT INTO menu_items
    (category_id, name_ru, name_en, name_tr, description_ru, description_en, description_tr, price, sort_order)
    VALUES (@category_id, @name_ru, @name_en, @name_tr, @description_ru, @description_en, @description_tr, @price, @sort_order)`);

  const insertAll = db.transaction(() => {
    categories.forEach((cat) => {
      const info = insertCat.run(cat);
      cat.items.forEach((item, idx) => {
        insertItem.run({ ...item, category_id: info.lastInsertRowid, sort_order: idx + 1 });
      });
    });
  });
  insertAll();
  console.log('[seed] menu seeded');
}

function seedEvents() {
  const count = db.prepare('SELECT COUNT(*) as c FROM events').get().c;
  if (count > 0) {
    console.log('[seed] events already present, skipping');
    return;
  }
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const plusDays = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };
  const events = [
    { title: 'Живая музыка: The Wandering Notes', slug: 'live-music-wandering-notes',
      event_date: iso(plusDays(1)), event_time: '20:00', price: 500,
      description_short: 'Кавер-группа играет рок и блюз хиты',
      description_long: 'Вечер живой музыки с кавер-группой The Wandering Notes — рок и блюз хиты 60-х-90-х. Бар работает до последнего гостя.',
      poster_image: '', video_url: '' },
    { title: 'Квиз-вечер на английском', slug: 'quiz-night-english',
      event_date: iso(plusDays(3)), event_time: '19:30', price: 300,
      description_short: 'Командная интеллектуальная игра, до 6 человек в команде',
      description_long: 'Классический паб-квиз на английском языке: 6 раундов, призы победителям, регистрация команд у входа или заранее по брони.',
      poster_image: '', video_url: '' },
    { title: 'Стендап open mic', slug: 'standup-open-mic',
      event_date: iso(plusDays(5)), event_time: '21:00', price: 400,
      description_short: 'Открытый микрофон для начинающих комиков',
      description_long: 'Вечер открытого микрофона: местные и приезжие комики обкатывают новый материал. Лёгкая атмосфера, недорогой вход.',
      poster_image: '', video_url: '' },
  ];
  const insert = db.prepare(`INSERT INTO events
    (title, slug, event_date, event_time, price, description_short, description_long, poster_image, video_url)
    VALUES (@title, @slug, @event_date, @event_time, @price, @description_short, @description_long, @poster_image, @video_url)`);
  const insertAll = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
  insertAll(events);
  console.log(`[seed] events seeded: ${events.length}`);
}

// В отличие от seedEvents (которая только заполняет пустую таблицу при
// первом запуске), эти конкретные мероприятия должны быть на сайте всегда —
// пересоздаём/обновляем их по slug при каждом старте сервера, даже если
// таблица events уже не пустая.
function upsertPersistentEvent(event) {
  db.prepare(`INSERT INTO events
    (title, slug, event_date, event_time, price, description_short, description_long, poster_image, video_url)
    VALUES (@title, @slug, @event_date, @event_time, @price, @description_short, @description_long, @poster_image, @video_url)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      event_date = excluded.event_date,
      event_time = excluded.event_time,
      price = excluded.price,
      description_short = excluded.description_short,
      description_long = excluded.description_long,
      poster_image = excluded.poster_image,
      video_url = excluded.video_url`).run(event);
  console.log(`[seed] "${event.title}" event ready`);
}

function seedPersistentEvents() {
  upsertPersistentEvent({
    title: 'LIVE MUSIC 🔥',
    slug: 'live-music-nyc-hits',
    event_date: '2026-08-28',
    event_time: '20:00',
    price: 0,
    description_short: 'Ребята исполняют самые популярные хиты улиц Нью-Йорка 🗽',
    description_long: 'Ребята исполняют самые популярные хиты улиц Нью-Йорка 🗽',
    poster_image: '',
    video_url: '/assets/video/live-music-nyc-hits.mp4',
  });
  upsertPersistentEvent({
    title: 'DJ RasuLove',
    slug: 'dj-rasulove',
    event_date: '2026-08-30',
    event_time: '21:00',
    price: 0,
    description_short: 'DJ музыка весь вечер, которая заставит вас танцевать 🪩',
    description_long: 'DJ музыка весь вечер, которая заставит вас танцевать 🪩',
    poster_image: '',
    video_url: '/assets/video/dj-rasulove.mp4',
  });
}

function run() {
  seedAdmin();
  seedHall();
  seedMenu();
  seedEvents();
  seedPersistentEvents();
}

if (require.main === module) {
  run();
}

module.exports = run;
