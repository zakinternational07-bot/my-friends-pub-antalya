const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

// Файлы, загруженные через админку, кладём на тот же постоянный диск, что
// и sqlite (DATA_DIR на Render — см. render.yaml/README), а не в
// frontend/assets: та папка — часть кода из git и пересоздаётся заново при
// каждом деплое/рестарте, поэтому загруженные туда файлы раньше пропадали.
// Отдаётся эта папка отдельным static-роутом /uploads (см. server.js).
const uploadsDir = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'uploads')
  : path.join(__dirname, '..', '..', 'data', 'uploads');

const IMAGES_DIR = path.join(uploadsDir, 'images', 'events');
const VIDEO_DIR = path.join(uploadsDir, 'video', 'events');

function destinationFor(mimetype) {
  return mimetype.startsWith('video/') ? VIDEO_DIR : IMAGES_DIR;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = destinationFor(file.mimetype);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, name);
  },
});

function fileFilter(req, file, cb) {
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Разрешены только изображения и видео'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 60 * 1024 * 1024 }, // 60 МБ — с запасом под видео
});

// Путь, который сохраняется в БД и отдаётся статикой Express (см. server.js).
function publicPathFor(file) {
  const kind = file.mimetype.startsWith('video/') ? 'video' : 'images';
  return `/uploads/${kind}/events/${file.filename}`;
}

module.exports = { upload, publicPathFor, uploadsDir };
