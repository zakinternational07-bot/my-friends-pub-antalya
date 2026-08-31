// Общие утилиты, используемые на публичных страницах.

function formatDateHuman(isoDate) {
  const [y, m, d] = isoDate.split('-');
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${Number(d)} ${months[Number(m) - 1]}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// Прибавляет минуты к времени "HH:MM" с переходом через полночь —
// используется для показа грейс-периода брони (15 минут на опоздание).
function addMinutesToTime(hhmm, minutesToAdd) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + minutesToAdd + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Картинка или видео-превью для карточки мероприятия — используется и в
// афише недели, и (в укрупнённом виде) на странице самого мероприятия.
function eventMediaHtml(ev) {
  if (ev.poster_image) {
    return `<img src="${escapeHtml(ev.poster_image)}" alt="" />`;
  }
  if (ev.video_url) {
    return `<video src="${escapeHtml(ev.video_url)}" muted autoplay loop playsinline preload="metadata"></video>`;
  }
  return '';
}
