const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const IMAGES_DIR = path.join(__dirname, '..', '..', '..', 'frontend', 'assets', 'images', 'events');
const VIDEO_DIR = path.join(__dirname, '..', '..', '..', 'frontend', 'assets', 'video', 'events');

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
  return `/assets/${kind}/events/${file.filename}`;
}

module.exports = { upload, publicPathFor };
