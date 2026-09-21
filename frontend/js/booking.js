document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('event');
  const mapEl = document.getElementById('hall-map');
  const seatsLayerEl = document.getElementById('hall-seats');
  const titleEl = document.getElementById('booking-event-title');
  const summaryEl = document.getElementById('booking-summary');
  const formEl = document.getElementById('booking-form');
  const errorEl = document.getElementById('booking-error');
  const partySizeOptionsEl = document.getElementById('party-size-options');
  const waitlistCardEl = document.getElementById('waitlist-card');
  const waitlistFormWrapEl = document.getElementById('waitlist-form-wrap');
  const waitlistErrorEl = document.getElementById('waitlist-error');
  const waitlistSubmitBtn = document.getElementById('waitlist-submit');
  const waitlistNameInput = document.getElementById('waitlist-name');
  const waitlistEmailInput = document.getElementById('waitlist-email');

  // Пабу невыгодно отдавать столик на 4 человека паре из двух — поэтому
  // по количеству гостей заранее сужаем список столиков, которые вообще
  // можно выбрать. Барные места — по одному человеку, доступны только
  // одиночным гостям.
  const SMALL_TABLES = ['Стол 1', 'Стол 7', 'Стол 8', 'Стол 9', 'Стол 10', 'Стол 13', 'Стол 16'];
  const MEDIUM_TABLES = ['Стол 2', 'Стол 3', 'Стол 4', 'Стол 5', 'Стол 6', 'Стол 11', 'Стол 12', 'Стол 14'];
  const LARGE_TABLES = ['Стол 15'];

  function allowedTableLabels(size) {
    if (size === 1) return [...SMALL_TABLES, 'Бар'];
    if (size === 2) return SMALL_TABLES;
    if (size === 3 || size === 4) return MEDIUM_TABLES;
    return [...LARGE_TABLES, 'Стол 11']; // 5+ — стол 11 тоже годится и на большую компанию
  }

  let partySize = null;

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
      const title = isBar ? seatLabel(group[0]) : `${group[0].table_label} (${group.length} мест)`;
      return { seatIds: group.map((s) => s.id), pos_x, pos_y, title, table_label: group[0].table_label };
    });
  }

  function unitStatus(unit) {
    const unitSeats = unit.seatIds.map((id) => seats.find((s) => s.id === id));
    if (unitSeats.every((s) => selected.has(s.id))) return 'selected';
    if (unitSeats.some((s) => s.status === 'taken')) return 'taken';
    if (unitSeats.some((s) => s.status === 'held' && !selected.has(s.id))) return 'held';
    return 'free';
  }

  // Платное мероприятие: столы рисуем как раньше, но они только фон —
  // кликаются отдельные стулья вокруг них.
  function renderChairs() {
    const tables = tableUnits().map((unit) => `<div class="table-unit table-unit-static"
        style="left:${unit.pos_x}%; top:${unit.pos_y}%;"
        title="${unit.title}"></div>`).join('');

    const chairs = seats.map((seat) => {
      const isSelected = selected.has(seat.id);
      return `<div class="seat${isSelected ? ' selected' : ''}"
        data-id="${seat.id}"
        data-status="${isSelected ? 'free' : seat.status}"
        style="left:${seat.pos_x}%; top:${seat.pos_y}%;"
        title="${seatLabel(seat)}"></div>`;
    }).join('');

    seatsLayerEl.innerHTML = tables + chairs;
  }

  function renderSeats() {
    if (isTicketedEvent()) {
      renderChairs();
      return;
    }
    const allowed = partySize ? allowedTableLabels(partySize) : null;
    seatsLayerEl.innerHTML = tableUnits().map((unit) => {
      const status = unitStatus(unit);
      const isSelected = status === 'selected';
      const isDisabled = allowed !== null && !allowed.includes(unit.table_label);
      const classes = ['table-unit'];
      if (isSelected) classes.push('selected');
      if (isDisabled) classes.push('table-unit-disabled');
      const title = isDisabled ? `${unit.title} — недоступен для выбранного числа гостей` : unit.title;
      return `<div class="${classes.join(' ')}"
        data-ids="${unit.seatIds.join(',')}"
        data-status="${isSelected ? 'free' : status}"
        style="left:${unit.pos_x}%; top:${unit.pos_y}%;"
        title="${title}"></div>`;
    }).join('');
  }

  // Показываем лист ожидания вместо формы брони, если для выбранного числа
  // гостей вообще нет свободных столиков — самой брони гость всё равно
  // оформить не может, дальше показывать пустую форму бессмысленно.
  function updateWaitlistVisibility() {
    if (!partySize) {
      waitlistCardEl.style.display = 'none';
      formEl.style.display = '';
      return;
    }
    if (isTicketedEvent()) {
      // Мест хватает, если свободных стульев не меньше, чем гостей.
      const freeChairs = seats.filter((s) => s.status === 'free').length;
      const enough = freeChairs >= partySize;
      waitlistCardEl.style.display = enough ? 'none' : 'block';
      formEl.style.display = enough ? '' : 'none';
      return;
    }
    const allowed = allowedTableLabels(partySize);
    const anyFree = tableUnits().some((u) => allowed.includes(u.table_label) && unitStatus(u) === 'free');
    waitlistCardEl.style.display = anyFree ? 'none' : 'block';
    formEl.style.display = anyFree ? '' : 'none';
  }

  function selectPartySize(size) {
    partySize = size;
    selected.clear();
    mapEl.classList.remove('hall-map-locked');
    [...partySizeOptionsEl.children].forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.size) === size);
    });
    renderSeats();
    renderSummary();
    updateWaitlistVisibility();
  }

  partySizeOptionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.party-size-btn');
    if (!btn) return;
    selectPartySize(Number(btn.dataset.size));
  });

  function renderSummary() {
    const count = selected.size;
    const total = event ? event.price * count : 0;
    const submitEl = formEl.querySelector('button[type="submit"]');

    if (isTicketedEvent()) {
      // Стульев нужно выбрать ровно по числу гостей: каждый стул — билет.
      if (!partySize) {
        summaryEl.innerHTML = 'Сначала выберите количество гостей';
      } else if (count === 0) {
        summaryEl.innerHTML = `Выберите на схеме места: нужно <strong>${partySize}</strong>`;
      } else if (count < partySize) {
        summaryEl.innerHTML = `Выбрано мест: <strong>${count}</strong> из ${partySize} · Сумма: <strong>${total} ₺</strong>`;
      } else {
        summaryEl.innerHTML = `Выбрано мест: <strong>${count}</strong> из ${partySize} · Сумма: <strong>${total} ₺</strong><br>`
          + '<span style="color:var(--text-muted);font-size:0.85rem;">Чтобы поменять место, снимите выбор с уже выбранного</span>';
      }
      submitEl.disabled = count !== partySize;
      return;
    }

    const totalText = event && event.price === 0 ? 'вход бесплатный' : `Сумма: <strong>${total} ₺</strong>`;
    summaryEl.innerHTML = count
      ? `Выбрано мест: <strong>${count}</strong> · ${totalText}`
      : partySize
        ? 'Выберите свободный столик на схеме'
        : 'Сначала выберите количество гостей';
    submitEl.disabled = count === 0;
  }

  mapEl.addEventListener('click', (e) => {
    if (!partySize) return;

    if (isTicketedEvent()) {
      const chairEl = e.target.closest('.seat');
      if (!chairEl) return;
      const id = Number(chairEl.dataset.id);
      const seat = seats.find((s) => s.id === id);
      if (!seat) return;
      if (selected.has(id)) {
        selected.delete(id);
      } else {
        if (seat.status !== 'free') return;
        // Больше мест, чем гостей, не продаём — сначала снять лишнее.
        if (selected.size >= partySize) return;
        selected.add(id);
      }
      renderSeats();
      renderSummary();
      return;
    }

    const unitEl = e.target.closest('.table-unit');
    if (!unitEl || unitEl.classList.contains('table-unit-disabled')) return;
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
    updateWaitlistVisibility();
  }

  const submitBtn = formEl.querySelector('button[type="submit"]');
  const isFreeEvent = () => event && event.price === 0;
  // На платных мероприятиях билет продаётся на конкретный стул, а не на
  // столик целиком: столы на схеме остаются, но выбираются стулья вокруг
  // них — ровно столько, сколько гостей.
  const isTicketedEvent = () => event && event.price > 0;
  // Платное мероприятие, у которого в админке указана внешняя страница
  // оплаты: вместо своей (тестовой) оплаты отправляем гостя туда.
  const externalPaymentUrl = () => (event && event.price > 0 && event.payment_url) || '';

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
    } else if (externalPaymentUrl()) {
      // Билет и письмо выдаёт внешний сайт оплаты, тестовая оплата тут ни при чём.
      const banner = document.getElementById('test-mode-banner');
      if (banner) banner.style.display = 'none';
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
          updateWaitlistVisibility();
        }
      } catch (e) { /* ignore */ }
    });
    ws.addEventListener('close', () => setTimeout(connectWs, 3000));
  }
  connectWs();

  // Фолбэк на случай проблем с WebSocket (например, нестабильный wifi заведения).
  setInterval(loadSeats, 15000);

  waitlistSubmitBtn.addEventListener('click', async () => {
    waitlistErrorEl.textContent = '';
    waitlistErrorEl.className = '';
    const name = waitlistNameInput.value.trim();
    const email = waitlistEmailInput.value.trim();
    if (!name) {
      waitlistErrorEl.textContent = 'Введите имя';
      waitlistErrorEl.className = 'form-error';
      return;
    }
    waitlistSubmitBtn.disabled = true;
    try {
      const result = await Api.post('/api/waitlist', { eventId: Number(eventId), partySize, name, email });
      waitlistFormWrapEl.innerHTML = `
        <p class="form-success">Готово — вы в листе ожидания. Как только место освободится, сразу пришлём уведомление на email.</p>
        ${result.telegramUrl ? `<a class="btn btn-telegram btn-block" href="${result.telegramUrl}" target="_blank" rel="noopener">Уведомлять ещё и в Telegram (быстрее) ✈</a>` : ''}
      `;
    } catch (err) {
      waitlistErrorEl.textContent = err.message;
      waitlistErrorEl.className = 'form-error';
      waitlistSubmitBtn.disabled = false;
    }
  });

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    errorEl.className = '';
    if (selected.size === 0) return;
    const paymentUrl = externalPaymentUrl();
    if (paymentUrl) {
      // window.open — строго до любого await, иначе браузер посчитает
      // вкладку всплывающим окном и заблокирует её.
      window.open(paymentUrl, '_blank', 'noopener');
      formEl.innerHTML = `
        <p class="form-success">Открыли страницу оплаты билетов в новой вкладке.</p>
        <a class="btn btn-block" href="${escapeHtml(paymentUrl)}" target="_blank" rel="noopener">Открыть оплату ещё раз</a>
      `;
      return;
    }
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
        partySize,
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
