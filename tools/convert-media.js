#!/usr/bin/env node
// Конвертер медиа для сайта: картинки -> .webp, видео -> .webm (VP9 + Opus).
// Кладём исходники в media/source/ (можно папками), запускаем скрипт, готовые
// файлы появляются в media/converted/ с той же структурой подпапок. Оттуда их
// уже можно переносить в frontend/assets/... там, где они нужны.
//
//   node tools/convert-media.js                  — сконвертировать всё новое
//   node tools/convert-media.js --force          — переделать и то, что уже есть
//   node tools/convert-media.js --max-width 1600 — заодно уменьшить до 1600px
//   node tools/convert-media.js --keep-names     — не приводить имена к web-виду
//   node tools/convert-media.js --crf 40         — сильнее/слабее жать видео
//   node tools/convert-media.js --mute          — выкинуть звук (для фоновых видео)
//   node tools/convert-media.js <входная> <выходная> — другие папки
//
// Нужен ffmpeg в системе (проверка при запуске).

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.mpg', '.mpeg']);

// Качество webp: 82 — визуально неотличимо от оригинала на фото, но заметно
// легче. CRF для VP9: чем больше число, тем сильнее сжатие и хуже картинка.
// 36 — разумная середина для веба; если исходник уже пожат (например, видео
// из мессенджера), результат может выйти тяжелее — тогда поднимаем --crf.
const WEBP_QUALITY = 82;
const DEFAULT_VP9_CRF = 36;
const OPUS_BITRATE = '128k';

const repoRoot = path.join(__dirname, '..');

function parseArgs(argv) {
  const opts = { force: false, maxWidth: 0, keepNames: false, mute: false, crf: DEFAULT_VP9_CRF, dirs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') opts.force = true;
    else if (arg === '--keep-names') opts.keepNames = true;
    else if (arg === '--mute') opts.mute = true;
    else if (arg === '--max-width') {
      opts.maxWidth = Number(argv[i + 1]);
      i += 1;
      if (!Number.isFinite(opts.maxWidth) || opts.maxWidth <= 0) {
        throw new Error('--max-width ожидает число, например: --max-width 1600');
      }
    } else if (arg === '--crf') {
      opts.crf = Number(argv[i + 1]);
      i += 1;
      if (!Number.isFinite(opts.crf) || opts.crf < 0 || opts.crf > 63) {
        throw new Error('--crf ожидает число 0-63, например: --crf 40');
      }
    } else if (arg.startsWith('--')) {
      throw new Error(`Неизвестный ключ: ${arg}`);
    } else {
      opts.dirs.push(arg);
    }
  }
  opts.srcDir = path.resolve(opts.dirs[0] || path.join(repoRoot, 'media', 'source'));
  opts.outDir = path.resolve(opts.dirs[1] || path.join(repoRoot, 'media', 'converted'));
  return opts;
}

// Имена вида "music saturday.PNG" в вебе неудобны (пробелы, регистр), поэтому
// по умолчанию приводим их к виду "music-saturday.webp".
function webName(baseName) {
  return baseName
    .toLowerCase()
    .replace(/['"’]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'file';
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

function runFfmpeg(args) {
  const res = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const tail = (res.stderr || '').trim().split('\n').slice(-3).join('\n');
    throw new Error(tail || `ffmpeg вышел с кодом ${res.status}`);
  }
}

function convertImage(src, dest, maxWidth) {
  const args = ['-y', '-i', src];
  // scale=-2 сохраняет пропорции и чётную высоту; 'min(iw,N)' не увеличивает
  // маленькие картинки до maxWidth.
  if (maxWidth) args.push('-vf', `scale='min(iw,${maxWidth})':-2`);
  args.push('-c:v', 'libwebp', '-quality', String(WEBP_QUALITY), '-preset', 'picture',
    '-compression_level', '6', '-an', dest);
  runFfmpeg(args);
}

function convertVideo(src, dest, maxWidth, crf, mute) {
  const args = ['-y', '-i', src];
  if (maxWidth) args.push('-vf', `scale='min(iw,${maxWidth})':-2`);
  args.push(
    '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0',
    '-row-mt', '1', '-cpu-used', '2', '-pix_fmt', 'yuv420p'
  );
  // Фоновые видео на сайте всё равно играют без звука — дорожка только
  // добавляет вес.
  if (mute) args.push('-an');
  else args.push('-c:a', 'libopus', '-b:a', OPUS_BITRATE);
  args.push(dest);
  runFfmpeg(args);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (spawnSync('ffmpeg', ['-version']).status !== 0) {
    console.error('Не найден ffmpeg — установи его (winget install Gyan.FFmpeg) и запусти скрипт снова.');
    process.exit(1);
  }
  if (!fs.existsSync(opts.srcDir)) {
    console.error(`Папки с исходниками нет: ${opts.srcDir}`);
    process.exit(1);
  }

  const files = walk(opts.srcDir).filter((f) => !path.basename(f).startsWith('.'));
  let done = 0;
  let skipped = 0;
  let totalBefore = 0;
  let totalAfter = 0;
  const problems = [];
  const gotHeavier = [];

  for (const src of files) {
    const ext = path.extname(src).toLowerCase();
    const isImage = IMAGE_EXT.has(ext);
    const isVideo = VIDEO_EXT.has(ext);
    const rel = path.relative(opts.srcDir, src);

    if (!isImage && !isVideo) {
      if (ext === '.webp' || ext === '.webm') {
        console.log(`= ${rel} — уже в нужном формате, пропускаю`);
      } else {
        console.log(`? ${rel} — не картинка и не видео, пропускаю`);
      }
      skipped += 1;
      continue;
    }

    const baseName = path.basename(src, path.extname(src));
    const outName = (opts.keepNames ? baseName : webName(baseName)) + (isImage ? '.webp' : '.webm');
    const dest = path.join(opts.outDir, path.dirname(rel), outName);
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    // Повторный запуск не переделывает то, что уже сконвертировано, — только
    // если исходник изменился или передан --force.
    if (!opts.force && fs.existsSync(dest)
        && fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs) {
      console.log(`= ${rel} — уже сконвертирован, пропускаю`);
      skipped += 1;
      continue;
    }

    const sizeBefore = fs.statSync(src).size;
    process.stdout.write(`… ${rel} → ${path.relative(opts.outDir, dest)}`);
    try {
      if (isImage) convertImage(src, dest, opts.maxWidth);
      else convertVideo(src, dest, opts.maxWidth, opts.crf, opts.mute);
    } catch (err) {
      console.log('  ОШИБКА');
      problems.push(`${rel}: ${err.message}`);
      continue;
    }

    const sizeAfter = fs.statSync(dest).size;
    totalBefore += sizeBefore;
    totalAfter += sizeAfter;
    done += 1;
    const diff = sizeBefore ? Math.round((sizeAfter / sizeBefore - 1) * 100) : 0;
    const label = diff > 0 ? `ТЯЖЕЛЕЕ на ${diff}%` : `−${Math.abs(diff)}%`;
    console.log(`  ${mb(sizeBefore)} → ${mb(sizeAfter)} (${label})`);
    if (diff > 0) gotHeavier.push(rel);
  }

  console.log(`\nГотово: ${done} сконвертировано, ${skipped} пропущено.`);
  if (done) console.log(`Общий вес: ${mb(totalBefore)} → ${mb(totalAfter)}`);
  console.log(`Результат: ${opts.outDir}`);

  // Если исходник уже был хорошо пожат, VP9 на дефолтном качестве может дать
  // файл тяжелее оригинала — молча оставлять такое нельзя, на сайт должен
  // попадать файл полегче.
  if (gotHeavier.length) {
    console.log('\nПосле конвертации стали ТЯЖЕЛЕЕ исходника:');
    gotHeavier.forEach((f) => console.log(`  ${f}`));
    console.log(`Попробуй сжать сильнее: node tools/convert-media.js --force --crf ${opts.crf + 6}`);
  }

  if (problems.length) {
    console.log('\nНе удалось сконвертировать:');
    problems.forEach((p) => console.log(`  ${p}`));
    process.exit(1);
  }
}

main();
