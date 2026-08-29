document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('event');
  const mapEl = document.getElementById('hall-map');
  const seatsLayerEl = document.getElementById('hall-seats');
  const titleEl = document.getElementById('booking-event-title');
  const summaryEl = document.getElementById('booking-summary');
  const formEl = document.getElementById('booking-form');
  const errorEl = document.getElementById('booking-error');

  if (!eventId) {
    mapEl.innerHTML = '<p class="form-error">Мероприятие не указано.</p>';
    return;
  }

  let event = null;
  let seats = [];
  const selected = new Set();

  function seatLabel(seat) {
    return `${seat.table_label}, место ${seat.seat_number}`;
  }

  function renderSeats() {
    seatsLayerEl.innerHTML = seats.map((seat) => {
      const isSelected = selected.has(seat.id);
      const status = isSelected ? 'free' : seat.status;
      return `<div class="seat${isSelected ? ' selected' : ''}"
        data-id="${seat.id}"
        data-status="${status}"
        style="left:${seat.pos_x}%; top:${seat.pos_y}%;"
        title="${seatLabel(seat)}"></div>`;
    }).join('');
  }

  function renderSummary() {
    const count = selected.size;
    const total = event ? event.price * count : 0;
    const totalText = event && event.price === 0 ? 'вход бесплатный' : `Сумма: <strong>${total} ₺</strong>`;
    summaryEl.innerHTML = count
      ? `Выбрано мест: <strong>${count}</strong> · ${totalText}`
      : 'Выберите свободные места на схеме';
    formEl.querySelector('button[type="submit"]').disabled = count === 0;
  }

  mapEl.addEventListener('click', (e) => {
    const seatEl = e.target.closest('.seat');
    if (!seatEl) return;
    const id = Number(seatEl.dataset.id);
    const seat = seats.find((s) => s.id === id);
    if (!seat || (seat.status !== 'free' && !selected.has(id))) return;
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    renderSeats();
    renderSummary();
  });

  async function loadSeats() {
    seats = await Api.get(`/api/events/${eventId}/seats`);
    renderSeats();
  }

  const submitBtn = formEl.querySelector('button[type="submit"]');
  const isFreeEvent = () => event && event.price === 0;

  try {
    event = await Api.get(`/api/events/${eventId}`);
    titleEl.textContent = `${event.title} — ${formatDateHuman(event.event_date)} ${event.event_time}`;
    if (isFreeEvent()) {
      submitBtn.textContent = 'Подтвердить бронь в Telegram ✈';
      submitBtn.classList.add('btn-telegram');
      const banner = document.getElementById('test-mode-banner');
      if (banner) banner.style.display = 'none';
    }
    await loadSeats();
    renderSummary();
  } catch (err) {
    mapEl.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
    return;
  }

  // --- Живое обновление занятости мест ---
  function connectWs() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'subscribe', eventId }));
    });
    ws.addEventListener('message', (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'seat_update' && Number(data.eventId) === Number(eventId)) {
          seats = data.seats;
          // Снимаем выбор с мест, которые кто-то успел занять раньше нас.
          [...selected].forEach((id) => {
            const seat = seats.find((s) => s.id === id);
            if (seat && seat.status !== 'free') selected.delete(id);
          });
          renderSeats();
          renderSummary();
        }
      } catch (e) { /* ignore */ }
    });
    ws.addEventListener('close', () => setTimeout(connectWs, 3000));
  }
  connectWs();

  // Фолбэк на случай проблем с WebSocket (например, нестабильный wifi заведения).
  setInterval(loadSeats, 15000);

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    errorEl.className = '';
    if (selected.size === 0) return;
    const name = formEl.name.value.trim();
    const email = formEl.email.value.trim();
    submitBtn.disabled = true;
    try {
      const result = await Api.post('/api/bookings', {
        eventId: Number(eventId),
        seatIds: [...selected],
        name,
        email,
      });
      window.location.href = isFreeEvent() && result.telegramUrl ? result.telegramUrl : result.paymentUrl;
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.className = 'form-error';
      submitBtn.disabled = false;
      await loadSeats();
      renderSummary();
    }
  });
});
