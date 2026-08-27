document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const root = document.getElementById('event-detail-root');

  if (!id) {
    root.innerHTML = '<p class="form-error">Мероприятие не указано.</p>';
    return;
  }

  try {
    const ev = await Api.get(`/api/events/${id}`);
    document.title = `${ev.title} — My Friends Pub Antalya`;

    const videoHtml = ev.video_url
      ? `<div class="event-video-wrap"><video controls src="${escapeHtml(ev.video_url)}" poster=""></video></div>`
      : '';

    root.innerHTML = `
      <div class="event-detail-header">
        <div class="event-detail-poster"></div>
        <div>
          <span class="tag">${formatDateHuman(ev.event_date)} · ${escapeHtml(ev.event_time)}</span>
          <h1>${escapeHtml(ev.title)}</h1>
          <p>${escapeHtml(ev.description_long || ev.description_short)}</p>
          <p><strong>${ev.price} ₺</strong> за место</p>
          <a class="btn" href="booking.html?event=${ev.id}">Забронировать / Купить билет</a>
        </div>
      </div>
      ${videoHtml}
    `;
  } catch (err) {
    root.innerHTML = `<p class="form-error">Не удалось загрузить мероприятие: ${escapeHtml(err.message)}</p>`;
  }
});
