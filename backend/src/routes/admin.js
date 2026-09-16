const express = require('express');
const db = require('../db/connection');
const requireAdmin = require('../middleware/requireAdmin');
const { upload, publicPathFor } = require('../middleware/upload');

const router = express.Router();
router.use(requireAdmin);

function slugify(title) {
  const base = title
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё\s-]/gi, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${base || 'event'}-${Date.now().toString(36)}`;
}

// ----- Events -----
router.get('/events', (req, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY event_date DESC, event_time DESC').all());
});

router.get('/events/:id', (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Мероприятие не найдено' });
  res.json(event);
});

// Одно поле «Описание» в админке — короткая версия для карточки афиши
// считается отсюда же, чтобы не заставлять админа заполнять два текста.
function splitDescription(description) {
  const long = (description || '').trim();
  const short = long.length > 140 ? `${long.slice(0, 140).trim()}…` : long;
  return { description_short: short, description_long: long };
}

// Ссылка на внешнюю страницу оплаты билетов — только для платных
// мероприятий (у бесплатных бронь подтверждается в Telegram). Пустая
// строка = оплата через сайт, как раньше.
function paymentUrlFor(e) {
  const price = Number(e.price) || 0;
  const url = String(e.payment_url || '').trim();
  if (price === 0 || !url) return { payment_url: '' };
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return { error: 'Ссылка на оплату должна начинаться с http:// или https://' };
  }
  return { payment_url: url };
}

router.post('/events', (req, res) => {
  const e = req.body || {};
  if (!e.title || !e.event_date || !e.event_time) {
    return res.status(400).json({ error: 'title, event_date и event_time обязательны' });
  }
  const payment = paymentUrlFor(e);
  if (payment.error) return res.status(400).json({ error: payment.error });
  const slug = e.slug && e.slug.trim() ? e.slug.trim() : slugify(e.title);
  const info = db.prepare(`INSERT INTO events
    (title, slug, event_date, event_time, price, description_short, description_long, poster_image, video_url, payment_url)
    VALUES (@title, @slug, @event_date, @event_time, @price, @description_short, @description_long, @poster_image, @video_url, @payment_url)`
  ).run({
    title: e.title,
    slug,
    event_date: e.event_date,
    event_time: e.event_time,
    price: Number(e.price) || 0,
    ...splitDescription(e.description),
    poster_image: e.poster_image || '',
    video_url: e.video_url || '',
    payment_url: payment.payment_url,
  });
  res.status(201).json(db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/events/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Мероприятие не найдено' });
  const e = req.body || {};
  const payment = paymentUrlFor(e);
  if (payment.error) return res.status(400).json({ error: payment.error });
  const merged = {
    ...existing,
    title: e.title,
    event_date: e.event_date,
    event_time: e.event_time,
    price: Number(e.price) || 0,
    ...splitDescription(e.description),
    poster_image: e.poster_image || '',
    video_url: e.video_url || '',
    payment_url: payment.payment_url,
    id: req.params.id,
  };
  db.prepare(`UPDATE events SET title=@title, slug=@slug, event_date=@event_date, event_time=@event_time,
    price=@price, description_short=@description_short, description_long=@description_long,
    poster_image=@poster_image, video_url=@video_url, payment_url=@payment_url WHERE id=@id`
  ).run(merged);
  res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id));
});

router.delete('/events/:id', (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Загрузка фото/видео для мероприятия. Возвращает путь, который админка
// затем передаёт как poster_image (фото) или video_url (видео) при
// создании/сохранении мероприятия.
router.post('/events/upload', (req, res) => {
  upload.single('media')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
    const type = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    res.json({ path: publicPathFor(req.file), type });
  });
});

// ----- Menu categories -----
router.get('/menu/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM menu_categories ORDER BY sort_order, id').all());
});

router.post('/menu/categories', (req, res) => {
  const c = req.body || {};
  if (!c.name_ru || !c.name_en || !c.name_tr) {
    return res.status(400).json({ error: 'Нужны названия на всех трёх языках' });
  }
  const info = db.prepare(
    'INSERT INTO menu_categories (name_ru, name_en, name_tr, sort_order) VALUES (?, ?, ?, ?)'
  ).run(c.name_ru, c.name_en, c.name_tr, Number(c.sort_order) || 0);
  res.status(201).json(db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/menu/categories/:id', (req, res) => {
  const c = req.body || {};
  db.prepare(
    'UPDATE menu_categories SET name_ru=?, name_en=?, name_tr=?, sort_order=? WHERE id=?'
  ).run(c.name_ru, c.name_en, c.name_tr, Number(c.sort_order) || 0, req.params.id);
  res.json(db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(req.params.id));
});

router.delete('/menu/categories/:id', (req, res) => {
  db.prepare('DELETE FROM menu_categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ----- Menu items -----
router.get('/menu/items', (req, res) => {
  res.json(db.prepare('SELECT * FROM menu_items ORDER BY category_id, sort_order, id').all());
});

router.post('/menu/items', (req, res) => {
  const i = req.body || {};
  if (!i.category_id || !i.name_ru || !i.name_en || !i.name_tr) {
    return res.status(400).json({ error: 'category_id и названия на всех языках обязательны' });
  }
  const info = db.prepare(`INSERT INTO menu_items
    (category_id, name_ru, name_en, name_tr, description_ru, description_en, description_tr, price, sort_order)
    VALUES (@category_id, @name_ru, @name_en, @name_tr, @description_ru, @description_en, @description_tr, @price, @sort_order)`
  ).run({
    category_id: i.category_id,
    name_ru: i.name_ru, name_en: i.name_en, name_tr: i.name_tr,
    description_ru: i.description_ru || '', description_en: i.description_en || '', description_tr: i.description_tr || '',
    price: Number(i.price) || 0,
    sort_order: Number(i.sort_order) || 0,
  });
  res.status(201).json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/menu/items/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Пункт меню не найден' });
  const i = { ...existing, ...req.body };
  db.prepare(`UPDATE menu_items SET category_id=@category_id, name_ru=@name_ru, name_en=@name_en, name_tr=@name_tr,
    description_ru=@description_ru, description_en=@description_en, description_tr=@description_tr,
    price=@price, sort_order=@sort_order WHERE id=@id`
  ).run({ ...i, price: Number(i.price) || 0, sort_order: Number(i.sort_order) || 0, id: req.params.id });
  res.json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id));
});

router.delete('/menu/items/:id', (req, res) => {
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ----- Hall layout -----
router.get('/hall', (req, res) => {
  res.json(db.prepare('SELECT * FROM hall_seats ORDER BY table_label, seat_number').all());
});

// Полная замена плана зала JSON-массивом [{table_label, seat_number, pos_x, pos_y}, ...]
router.put('/hall', (req, res) => {
  const seats = req.body && req.body.seats;
  if (!Array.isArray(seats)) return res.status(400).json({ error: 'Ожидается массив seats' });
  for (const s of seats) {
    if (!s.table_label || !s.seat_number || s.pos_x == null || s.pos_y == null) {
      return res.status(400).json({ error: 'Каждое место требует table_label, seat_number, pos_x, pos_y' });
    }
  }
  const replaceAll = db.transaction((rows) => {
    db.prepare('DELETE FROM hall_seats').run();
    const insert = db.prepare(
      'INSERT INTO hall_seats (table_label, seat_number, pos_x, pos_y) VALUES (@table_label, @seat_number, @pos_x, @pos_y)'
    );
    rows.forEach((r) => insert.run(r));
  });
  replaceAll(seats);
  res.json({ success: true, count: seats.length });
});

// ----- Bookings (read-only overview) -----
router.get('/bookings', (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, e.title as event_title, e.event_date as event_date, e.event_time as event_time
    FROM bookings b JOIN events e ON e.id = b.event_id
    ORDER BY b.created_at DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

// ----- Surveys (опрос по итогам визита, read-only) -----
router.get('/surveys', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.submitted_at, s.rating_service, s.rating_food, s.rating_drinks, s.rating_overall, s.comment,
           b.customer_name, b.booking_ref, b.customer_email, b.telegram_username,
           e.title as event_title, e.event_date as event_date
    FROM surveys s
    JOIN bookings b ON b.id = s.booking_id
    JOIN events e ON e.id = s.event_id
    WHERE s.submitted_at IS NOT NULL
    ORDER BY s.submitted_at DESC
    LIMIT 200
  `).all();

  const avgRow = (extraWhere) => db.prepare(`
    SELECT COUNT(*) as n, AVG(rating_service) as service, AVG(rating_food) as food,
           AVG(rating_drinks) as drinks, AVG(rating_overall) as overall
    FROM surveys WHERE submitted_at IS NOT NULL ${extraWhere}
  `).get();

  res.json({
    rows,
    allTime: avgRow(''),
    last7d: avgRow("AND submitted_at >= datetime('now', '-7 days')"),
  });
});

module.exports = router;
