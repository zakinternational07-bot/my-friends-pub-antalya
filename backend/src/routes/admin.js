const express = require('express');
const db = require('../db/connection');
const requireAdmin = require('../middleware/requireAdmin');

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

router.post('/events', (req, res) => {
  const e = req.body || {};
  if (!e.title || !e.event_date || !e.event_time) {
    return res.status(400).json({ error: 'title, event_date и event_time обязательны' });
  }
  const slug = e.slug && e.slug.trim() ? e.slug.trim() : slugify(e.title);
  const info = db.prepare(`INSERT INTO events
    (title, slug, event_date, event_time, price, description_short, description_long, poster_image, video_url)
    VALUES (@title, @slug, @event_date, @event_time, @price, @description_short, @description_long, @poster_image, @video_url)`
  ).run({
    title: e.title,
    slug,
    event_date: e.event_date,
    event_time: e.event_time,
    price: Number(e.price) || 0,
    description_short: e.description_short || '',
    description_long: e.description_long || '',
    poster_image: e.poster_image || '',
    video_url: e.video_url || '',
  });
  res.status(201).json(db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/events/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Мероприятие не найдено' });
  const e = { ...existing, ...req.body };
  db.prepare(`UPDATE events SET title=@title, slug=@slug, event_date=@event_date, event_time=@event_time,
    price=@price, description_short=@description_short, description_long=@description_long,
    poster_image=@poster_image, video_url=@video_url WHERE id=@id`
  ).run({ ...e, price: Number(e.price) || 0, id: req.params.id });
  res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id));
});

router.delete('/events/:id', (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
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

module.exports = router;
