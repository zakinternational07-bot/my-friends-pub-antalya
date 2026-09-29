document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const root = document.getElementById('event-detail-root');

  if (!id) {
    root.innerHTML = '<p class="form-error">Мероприятие не указано.</p>';
    return;
  }

  // Автовоспроизведение со звуком браузеры блокируют всегда — видео
  // стартует само, но без звука, и рядом кнопка «включить звук» на один тап.
  function videoBlockHtml(url, videoId) {
    return `
      <div class="event-video-frame">
        <video id="${videoId}" src="${escapeHtml(url)}" autoplay muted loop playsinline></video>
        <button type="button" class="event-video-unmute" data-target="${videoId}" aria-label="Включить звук">🔇</button>
      </div>
    `;
  }

  function wireUnmuteButtons() {
    root.querySelectorAll('.event-video-unmute').forEach((btn) => {
      btn.addEventListener('click', () => {
        const video = document.getElementById(btn.dataset.target);
        if (!video) return;
        video.muted = !video.muted;
        btn.textContent = video.muted ? '🔇' : '🔊';
      });
    });
  }

  try {
    const ev = await Api.get(`/api/events/${id}`);
    document.title = `${ev.title} — My Friends Pub Antalya`;

    // Если загружено и фото, и видео — фото идёт постером, а видео (запись
    // с прошлых похожих мероприятий) отдельным блоком ниже. Если видео без
    // фото — видео само становится постером, не прячется где-то внизу.
    const posterHtml = ev.poster_image
      ? `<img src="${escapeHtml(ev.poster_image)}" alt="" />`
      : ev.video_url
        ? videoBlockHtml(ev.video_url, 'event-poster-video')
        : '';
    // У платных мероприятий билеты продаются на внешней площадке (ссылку
    // админ указывает в мероприятии): кнопка ведёт сразу туда, схему зала
    // на сайте не показываем — места распределяет персонал по проданным
    // билетам. Если ссылку не указали, остаётся обычная бронь на сайте.
    function ctaHtml(event) {
      if (event.price > 0 && event.payment_url) {
        return `<a class="btn" href="${escapeHtml(event.payment_url)}" target="_blank" rel="noopener">Купить билеты</a>`;
      }
      return `<a class="btn" href="booking.html?event=${event.id}">Забронировать</a>`;
    }

    const videoHtml = (ev.poster_image && ev.video_url)
      ? `<div class="event-video-wrap">${videoBlockHtml(ev.video_url, 'event-extra-video')}</div>`
      : '';

    root.innerHTML = `
      <div class="event-detail-header">
        <div class="event-detail-poster">
          ${posterHtml}
        </div>
        <div>
          <span class="tag">${formatDateHuman(ev.event_date)} · ${escapeHtml(ev.event_time)}</span>
          <h1>${escapeHtml(ev.title)}</h1>
          <p>${escapeHtml(ev.description_long || ev.description_short)}</p>
          <p><strong>${ev.price} ₺</strong> за место</p>
          ${ctaHtml(ev)}
        </div>
      </div>
      ${videoHtml}
    `;
    wireUnmuteButtons();
  } catch (err) {
    root.innerHTML = `<p class="form-error">Не удалось загрузить мероприятие: ${escapeHtml(err.message)}</p>`;
  }
});
