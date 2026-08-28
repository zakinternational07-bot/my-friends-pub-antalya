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
