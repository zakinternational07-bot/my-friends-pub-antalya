document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('events-root');
  try {
    const events = await Api.get('/api/events?scope=week');
    if (!events.length) {
      root.innerHTML = '<p class="empty-state">На этой неделе мероприятий пока нет — загляните позже.</p>';
      return;
    }
    root.innerHTML = `<div class="event-grid">${events.map((ev) => `
      <a class="card event-card" href="event.html?id=${ev.id}">
        <div class="event-card-photo">
          ${ev.poster_image ? `<img src="${escapeHtml(ev.poster_image)}" alt="" />` : ''}
          ${!ev.poster_image && ev.video_url ? '<span class="event-card-video-badge">▶</span>' : ''}
          <span class="event-card-date">${formatDateHuman(ev.event_date)}</span>
        </div>
        <div class="event-card-body">
          <h3>${escapeHtml(ev.title)}</h3>
          <p>${escapeHtml(ev.description_short)}</p>
          <div class="event-card-meta">
            <span>${escapeHtml(ev.event_time)}</span>
            <span>${ev.price} ₺</span>
          </div>
        </div>
      </a>
    `).join('')}</div>`;
  } catch (err) {
    root.innerHTML = `<p class="form-error">Не удалось загрузить афишу: ${escapeHtml(err.message)}</p>`;
  }
});
