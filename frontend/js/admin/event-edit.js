document.addEventListener('DOMContentLoaded', async () => {
  const me = await initAdminShell('events');
  if (!me) return;

  const id = new URLSearchParams(window.location.search).get('id');
  const form = document.getElementById('event-form');
  const errorEl = document.getElementById('event-form-error');
  document.getElementById('event-form-title').textContent = id ? 'Редактировать мероприятие' : 'Новое мероприятие';

  if (id) {
    try {
      const ev = await Api.get(`/api/admin/events/${id}`);
      Object.keys(ev).forEach((key) => {
        if (form[key]) form[key].value = ev[key];
      });
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    const payload = {
      title: form.title.value.trim(),
      slug: form.slug.value.trim(),
      event_date: form.event_date.value,
      event_time: form.event_time.value,
      price: Number(form.price.value) || 0,
      description_short: form.description_short.value.trim(),
      description_long: form.description_long.value.trim(),
      poster_image: form.poster_image.value.trim(),
      video_url: form.video_url.value.trim(),
    };
    try {
      if (id) {
        await Api.put(`/api/admin/events/${id}`, payload);
      } else {
        await Api.post('/api/admin/events', payload);
      }
      window.location.href = 'events.html';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
});
