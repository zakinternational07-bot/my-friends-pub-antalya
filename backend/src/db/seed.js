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

// Барные места — это уже сами по себе отдельные посадочные места (по одному
// человеку на место), а не столик с несколькими стульями вокруг — поэтому
// координаты задаются напрямую, без разброса вокруг центра.
function barSeats(tableLabel, positions) {
  return positions.map((pos, i) => ({
    table_label: tableLabel,
    seat_number: i + 1,
    pos_x: pos.x,
    pos_y: pos.y,
  }));
}

// План зала на основе реальной схемы паба: слева столики на 4 места,
// в центре — столик на 6 (Стол 15) и столики на 2, справа — барные места
// (по одному месту) и сама барная стойка.
function hallLayout() {
  return [
    // Левая колонна — столики на 4 места. Сдвинута правее (было 10), чтобы
    // не наезжать на расширенную полосу "Вид на море" слева — на мобильных
    // экранах она шире относительно узкой схемы, чем на десктопе.
    ...tableSeats('Стол 6', 16, 12, 4),
    ...tableSeats('Стол 5', 16, 27, 4),
    ...tableSeats('Стол 4', 16, 42, 4),
    ...tableSeats('Стол 3', 16, 57, 4),
    ...tableSeats('Стол 2', 16, 72, 4),
    ...tableSeats('Стол 1', 20, 90, 4),
    // Средняя левая колонна — Стол 15 на 6 мест, остальные на 2. Все на
    // одном x (было вразнобой 28-30) — ровная линия, и чуть правее, ближе
    // к столам у бара.
    ...tableSeats('Стол 15', 32, 12, 6, 6.5),
    ...tableSeats('Стол 10', 32, 30, 2, 3.5),
    ...tableSeats('Стол 9', 32, 45, 2, 3.5),
    ...tableSeats('Стол 8', 32, 60, 2, 3.5),
    ...tableSeats('Стол 7', 32, 75, 2, 3.5),
    ...tableSeats('Стол 16', 36, 90, 2, 3.5),
    // Средняя правая колонна — Стол 14, 12, 11 на 4 места, Стол 13 на 2.
    // Сдвинута чуть правее (было 46), чтобы не быть прижатой к соседней
    // колонне (7-10, 15).
    ...tableSeats('Стол 14', 50, 27, 4),
    ...tableSeats('Стол 13', 50, 42, 2, 3.5),
    ...tableSeats('Стол 12', 50, 57, 4),
    ...tableSeats('Стол 11', 50, 72, 4),
    // Барные места — по одному месту на человека, придвинуты вплотную к
    // барной стойке (это стулья прямо у бара), с запасом по вертикали
    // между собой, чтобы квадраты не слипались на узких экранах.
    ...barSeats('Бар', [
      { x: 69, y: 22 },
      { x: 69, y: 36 },
      { x: 69, y: 50 },
      { x: 69, y: 64 },
      { x: 69, y: 78 },
    ]),
  ];
}

// В отличие от старой логики (сидировать план зала только один раз, пока
// таблица пустая), план зала должен всегда соответствовать актуальной схеме
// паба в коде — пересобираем его по ключу «столик + номер места» при каждом
// старте сервера. Места из брони не трогаем: если на месте уже есть бронь,
// а в новой схеме его больше нет, оставляем такое место как есть — иначе
// нарушим внешний ключ booking_seats.seat_id и историю броней.
function seedHall() {
  const layout = hallLayout();
  const findSeat = db.prepare('SELECT id FROM hall_seats WHERE table_label = ? AND seat_number = ?');
  const insertSeat = db.prepare(
    'INSERT INTO hall_seats (table_label, seat_number, pos_x, pos_y) VALUES (@table_label, @seat_number, @pos_x, @pos_y)'
  );
  const updateSeat = db.prepare(
    'UPDATE hall_seats SET pos_x = @pos_x, pos_y = @pos_y WHERE table_label = @table_label AND seat_number = @seat_number'
  );
  const hasBooking = db.prepare('SELECT 1 FROM booking_seats WHERE seat_id = ?');
  const deleteSeat = db.prepare('DELETE FROM hall_seats WHERE id = ?');

  const applyLayout = db.transaction((rows) => {
    rows.forEach((seat) => {
      const existing = findSeat.get(seat.table_label, seat.seat_number);
      if (existing) updateSeat.run(seat); else insertSeat.run(seat);
    });
    const desiredKeys = new Set(rows.map((s) => `${s.table_label}::${s.seat_number}`));
    const stale = db.prepare('SELECT id, table_label, seat_number FROM hall_seats').all()
      .filter((s) => !desiredKeys.has(`${s.table_label}::${s.seat_number}`));
    stale.forEach((s) => {
      if (!hasBooking.get(s.id)) deleteSeat.run(s.id);
    });
  });
  applyLayout(layout);
  console.log(`[seed] hall layout ready: ${layout.length} seats`);
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
    event_date: '2026-09-04',
    event_time: '20:00',
    price: 300,
    description_short: 'Живые хиты под гитару — танцы, драйв, атмосфера вечеринки 🎸',
    description_long: 'Живые хиты под гитару — танцы, драйв, атмосфера вечеринки 🎸',
    poster_image: '',
    video_url: '/assets/video/live-music-nyc-hits.mp4',
  });
  upsertPersistentEvent({
    title: 'DJ RasuLove',
    slug: 'dj-rasulove',
    event_date: '2026-09-05',
    event_time: '21:00',
    price: 500,
    description_short: 'DJ-сеты на весь вечер — танцы до полуночи 🪩',
    description_long: 'DJ-сеты на весь вечер — танцы до полуночи 🪩',
    poster_image: '',
    video_url: '/assets/video/dj-rasulove-saturday.mp4',
  });
  upsertPersistentEvent({
    title: 'Street Players',
    slug: 'street-players',
    event_date: '2026-08-28',
    event_time: '20:00',
    price: 300,
    description_short: 'Ребята исполняют самые популярные песни улиц Нью-Йорка 🗽',
    description_long: 'Ребята исполняют самые популярные песни улиц Нью-Йорка 🗽',
    poster_image: '/assets/images/street-players.jpg',
    video_url: '',
  });
  upsertPersistentEvent({
    title: 'Тихий вечер',
    slug: 'quiet-evening-monday',
    event_date: '2026-08-31',
    event_time: '19:00',
    price: 0,
    description_short: 'Спокойный вечер в пабе: тихая музыка и уютная атмосфера',
    description_long: 'Спокойный вечер в пабе: тихая музыка и уютная атмосфера, время для разговоров без лишней суеты.',
    poster_image: '',
    video_url: '/assets/video/quiet-evening-monday.mp4',
  });
  upsertPersistentEvent({
    title: 'Тихий вечер',
    slug: 'quiet-evening-tuesday',
    event_date: '2026-09-01',
    event_time: '19:00',
    price: 0,
    description_short: 'Тихий вечер без суеты — отдохнуть после длинного дня',
    description_long: 'Тихий вечер без суеты — идеально, чтобы отдохнуть после длинного дня в спокойной компании.',
    poster_image: '',
    video_url: '/assets/video/quiet-evening-tuesday.mp4',
  });
  upsertPersistentEvent({
    title: 'Тихий вечер',
    slug: 'quiet-evening-wednesday',
    event_date: '2026-09-02',
    event_time: '19:00',
    price: 0,
    description_short: 'Уютный тихий вечер — спокойная атмосфера и хорошая компания',
    description_long: 'Уютный тихий вечер в пабе — спокойная атмосфера, хорошая компания и никакой спешки.',
    poster_image: '',
    video_url: '/assets/video/quiet-evening-wednesday.mp4',
  });
  upsertPersistentEvent({
    title: 'Тихий вечер',
    slug: 'quiet-evening-thursday',
    event_date: '2026-09-03',
    event_time: '19:00',
    price: 0,
    description_short: 'Тихий вечер: бокал вина и лёгкая атмосфера без спешки',
    description_long: 'Тихий вечер: бокал вина, лёгкая атмосфера и время для себя без спешки.',
    poster_image: '/assets/images/quiet-evening-thursday.jpg',
    video_url: '',
  });
  upsertPersistentEvent({
    title: 'ЯБАНДЖИ Standup',
    slug: 'yabandzhi-standup',
    event_date: '2026-09-06',
    event_time: '20:00',
    price: 700,
    description_short: 'Стендап от комиков-иностранцев о жизни в Турции — метко и смешно',
    description_long: 'Стендап-вечер от комиков-иностранцев (ябанджи) о жизни в Турции — взгляд со стороны на местные привычки и культуру, метко и смешно.',
    poster_image: '',
    video_url: '/assets/video/yabandzhi-standup.mp4',
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
