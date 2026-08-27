const express = require('express');
const db = require('../db/connection');
const { getSeatStatuses } = require('../services/seatHold');

const router = express.Router();

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // move to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfWeek(d) {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

router.get('/', (req, res) => {
  const scope = req.query.scope || 'week';
  let events;
  if (scope === 'all') {
    events = db.prepare('SELECT * FROM events ORDER BY event_date, event_time').all();
  } else {
    const now = new Date();
    const from = (scope === 'week' ? startOfWeek(now) : now).toISOString().slice(0, 10);
    const to = endOfWeek(now).toISOString().slice(0, 10);
    events = db.prepare(
      'SELECT * FROM events WHERE event_date BETWEEN ? AND ? ORDER BY event_date, event_time'
    ).all(from, to);
  }
  res.json(events);
});

router.get('/:idOrSlug', (req, res) => {
  const { idOrSlug } = req.params;
  const event = /^\d+$/.test(idOrSlug)
    ? db.prepare('SELECT * FROM events WHERE id = ?').get(idOrSlug)
    : db.prepare('SELECT * FROM events WHERE slug = ?').get(idOrSlug);
  if (!event) return res.status(404).json({ error: 'Мероприятие не найдено' });
  res.json(event);
});

router.get('/:id/seats', (req, res) => {
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Мероприятие не найдено' });
  res.json(getSeatStatuses(event.id));
});

module.exports = router;
