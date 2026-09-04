const express = require('express');
const crypto = require('crypto');
const db = require('../db/connection');
const telegram = require('../services/telegram');

const router = express.Router();

router.post('/', (req, res) => {
  const { eventId, partySize, name, email } = req.body || {};

  if (!eventId || !partySize || !name) {
    return res.status(400).json({ error: 'Заполните имя и количество гостей' });
  }
  const trimmedEmail = String(email || '').trim();
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Укажите корректный email — на него придёт уведомление' });
  }

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'Мероприятие не найдено' });

  const telegramLinkToken = `wl_${crypto.randomBytes(16).toString('hex')}`;
  const leaveToken = crypto.randomBytes(16).toString('hex');

  db.prepare(`
    INSERT INTO waitlist (event_id, party_size, customer_name, customer_email, telegram_link_token, leave_token)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(eventId, Number(partySize), name.trim(), trimmedEmail, telegramLinkToken, leaveToken);

  res.status(201).json({
    success: true,
    telegramUrl: telegram.botDeepLink(telegramLinkToken),
  });
});

module.exports = router;
