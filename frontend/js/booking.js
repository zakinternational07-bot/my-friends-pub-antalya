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

  // Столик на схеме — один квадрат = весь стол, бронируется целиком (все
  // его места разом), кроме барных мест — каждое из них само по себе
  // отдельное посадочное место (один человек), поэтому у бара свой квадрат
  // на каждое место.
  function tableUnits() {
    const groups = new Map();
    seats.forEach((seat) => {
      const key = seat.table_label === 'Бар' ? `bar:${seat.id}` : `table:${seat.table_label}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(seat);
    });
    return [...groups.values()].map((group) => {
      const pos_x = group.reduce((sum, s) => sum + s.pos_x, 0) / group.length;
      const pos_y = group.reduce((sum, s) => sum + s.pos_y, 0) / group.length;
      const isBar = group[0].table_label === 'Бар';
      const label = isBar
        ? String(30 + group[0].seat_number)
        : group[0].table_label.replace(/\D/g, '');
      const title = isBar ? seatLabel(group[0]) : `${group[0].table_label} (${group.length} мест)`;
      return { seatIds: group.map((s) => s.id), pos_x, pos_y, label, title };
    });
  }

  function unitStatus(unit) {
    const unitSeats = unit.seatIds.map((id) => seats.find((s) => s.id === id));
    if (unitSeats.every((s) => selected.has(s.id))) return 'selected';
    if (unitSeats.some((s) => s.status === 'taken')) return 'taken';
    if (unitSeats.some((s) => s.status === 'held' && !selected.has(s.id))) return 'held';
    return 'free';
  }

  function renderSeats() {
    seatsLayerEl.innerHTML = tableUnits().map((unit) => {
      const status = unitStatus(unit);
      const isSelected = status === 'selected';
      return `<div class="table-unit${isSelected ? ' selected' : ''}"
        data-ids="${unit.seatIds.join(',')}"
        data-status="${isSelected ? 'free' : status}"
        style="left:${unit.pos_x}%; top:${unit.pos_y}%;"
        title="${unit.title}">${unit.label}</div>`;
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
    const unitEl = e.target.closest('.table-unit');
    if (!unitEl) return;
    const ids = unitEl.dataset.ids.split(',').map(Number);
    const unitSeats = ids.map((id) => seats.find((s) => s.id === id)).filter(Boolean);
    const isSelected = unitSeats.every((s) => selected.has(s.id));
    if (!isSelected && unitSeats.some((s) => s.status !== 'free')) return;
    if (isSelected) ids.forEach((id) => selected.delete(id));
    else ids.forEach((id) => selected.add(id));
    renderSeats();
    renderSummary();
  });

  async function loadSeats() {
    seats = await Api.get(`/api/events/${eventId}/seats`);
    renderSeats();
  }

  const submitBtn = formEl.querySelector('button[type="submit"]');
  const isFreeEvent = () => event && event.price === 0;

  const arrivalInput = document.getElementById('arrival_time');
  const arrivalHint = document.getElementById('arrival-hint');
  arrivalHint.textContent = 'Место держится ещё 15 минут после этого времени.';

  const emailField = document.getElementById('email-field');
  const emailInput = document.getElementById('email');

  try {
    event = await Api.get(`/api/events/${eventId}`);
    titleEl.textContent = `${event.title} — ${formatDateHuman(event.event_date)} ${event.event_time}`;
    arrivalInput.value = event.event_time;
    if (isFreeEvent()) {
      submitBtn.textContent = 'Подтвердить бронь в Telegram ✈';
      submitBtn.classList.add('btn-telegram');
      const banner = document.getElementById('test-mode-banner');
      if (banner) banner.style.display = 'none';
      // Билет на почту не шлём для бесплатных мероприятий — подтверждение
      // и так приходит в Telegram-бот, почта тут не нужна.
      emailField.style.display = 'none';
      emailInput.required = false;
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
    const email = isFreeEvent() ? '' : formEl.email.value.trim();
    const arrivalTime = arrivalInput.value;
    submitBtn.disabled = true;
    try {
      const result = await Api.post('/api/bookings', {
        eventId: Number(eventId),
        seatIds: [...selected],
        name,
        email,
        arrivalTime,
      });
      if (isFreeEvent() && result.telegramUrl) {
        window.open(result.telegramUrl, '_blank', 'noopener');
        formEl.innerHTML = `
          <p class="form-success">Открыли Telegram в новой вкладке — нажмите там «Start», чтобы подтвердить бронь. Место удержано за вами 10 минут.</p>
          <a class="btn btn-telegram btn-block" href="${result.telegramUrl}" target="_blank" rel="noopener">Открыть Telegram ещё раз ✈</a>
        `;
      } else {
        window.location.href = result.paymentUrl;
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.className = 'form-error';
      submitBtn.disabled = false;
      await loadSeats();
      renderSummary();
    }
  });
});
