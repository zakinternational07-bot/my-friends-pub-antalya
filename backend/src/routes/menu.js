const express = require('express');
const db = require('../db/connection');

const router = express.Router();
const ALLOWED_LANGS = ['ru', 'en', 'tr'];

router.get('/', (req, res) => {
  const lang = ALLOWED_LANGS.includes(req.query.lang) ? req.query.lang : 'ru';
  const categories = db.prepare('SELECT * FROM menu_categories ORDER BY sort_order, id').all();
  const items = db.prepare('SELECT * FROM menu_items ORDER BY sort_order, id').all();

  const result = categories.map((cat) => ({
    id: cat.id,
    name: cat[`name_${lang}`],
    items: items
      .filter((item) => item.category_id === cat.id)
      .map((item) => ({
        id: item.id,
        name: item[`name_${lang}`],
        description: item[`description_${lang}`],
        price: item.price,
      })),
  }));

  res.json(result);
});

module.exports = router;
