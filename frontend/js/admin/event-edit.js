document.addEventListener('DOMContentLoaded', async () => {
  const me = await initAdminShell('events');
  if (!me) return;

  const id = new URLSearchParams(window.location.search).get('id');
  const form = document.getElementById('event-form');
  const errorEl = document.getElementById('event-form-error');
  const mediaInput = document.getElementById('media-input');
  const mediaPreview = document.getElementById('media-preview');
  const mediaStatus = document.getElementById('media-status');
  const mediaRemoveBtn = document.getElementById('media-remove-btn');
  document.getElementById('event-form-title').textContent = id ? 'Редактировать мероприятие' : 'Новое мероприятие';

  // Текущее состояние медиафайла мероприятия: одно из двух — фото или видео.
  let media = { path: '', type: '' };

  function renderMediaPreview() {
    if (!media.path) {
      mediaPreview.innerHTML = '';
      mediaRemoveBtn.style.display = 'none';
      return;
    }
    mediaPreview.innerHTML = media.type === 'video'
      ? `<video src="${media.path}" controls></video>`
      : `<img src="${media.path}" alt="" />`;
    mediaRemoveBtn.style.display = 'inline-block';
  }

  mediaRemoveBtn.addEventListener('click', () => {
    media = { path: '', type: '' };
    mediaInput.value = '';
    mediaStatus.textContent = '';
    renderMediaPreview();
  });

  mediaInput.addEventListener('change', async () => {
    const file = mediaInput.files[0];
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) {
      mediaStatus.textContent = 'Файл больше 60 МБ — выбери файл поменьше.';
      mediaInput.value = '';
      return;
    }

    // Мгновенное превью локальным файлом, пока идёт загрузка на сервер.
    media = { path: URL.createObjectURL(file), type: file.type.startsWith('video/') ? 'video' : 'image' };
    renderMediaPreview();
    mediaStatus.textContent = 'Загрузка...';

    try {
      const formData = new FormData();
      formData.append('media', file);
      const res = await fetch('/api/admin/events/upload', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить файл');
      media = { path: data.path, type: data.type };
      renderMediaPreview();
      mediaStatus.textContent = 'Загружено';
    } catch (err) {
      mediaStatus.textContent = err.message;
      media = { path: '', type: '' };
      renderMediaPreview();
    }
  });

  if (id) {
    try {
      const ev = await Api.get(`/api/admin/events/${id}`);
      form.title.value = ev.title || '';
      form.description.value = ev.description_long || ev.description_short || '';
      form.event_date.value = ev.event_date || '';
      form.event_time.value = ev.event_time || '';
      form.price.value = ev.price || 0;
      if (ev.video_url) {
        media = { path: ev.video_url, type: 'video' };
      } else if (ev.poster_image) {
        media = { path: ev.poster_image, type: 'image' };
      }
      renderMediaPreview();
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
      description: form.description.value.trim(),
      event_date: form.event_date.value,
      event_time: form.event_time.value,
      price: Number(form.price.value) || 0,
      poster_image: media.type === 'image' ? media.path : '',
      video_url: media.type === 'video' ? media.path : '',
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
