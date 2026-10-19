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

  function unitSeatsOf(unit) {
    return unit.seatIds.map((id) => seats.find((s) => s.id === id)).filter(Boolean);
  }

  // Можно ли добавить ещё одно место: для компании точного размера — пока
  // не набрали по числу гостей, для «5+» — без ограничения сверху.
  function canSelectMore() {
    return isOpenEndedParty() || selected.size < partySize;
  }

  function chairHtml(seat, extraClass) {
    const isSelected = selected.has(seat.id);
    return `<div class="seat${isSelected ? ' selected' : ''}${extraClass ? ' ' + extraClass : ''}"
      data-id="${seat.id}"
      data-status="${isSelected ? 'free' : seat.status}"
      title="${escapeHtml(seatLabel(seat))}"`;
  }

  // Платное мероприятие: на схеме только столы — на телефоне отдельные
  // стулья стоят слишком кучно, чтобы попадать по ним пальцем. Стулья
  // выбираются в отдельном окне стола (см. openTableModal). Барные места
  // — «столы» из одного места, их выбирают прямо на схеме.
  function renderChairs() {
    seatsLayerEl.innerHTML = tableUnits().map((unit) => {
      const unitSeats = unitSeatsOf(unit);

      if (unitSeats.length === 1) {
        const seat = unitSeats[0];
        return `${chairHtml(seat)} style="left:${seat.pos_x}%; top:${seat.pos_y}%;"></div>`;
      }

      const selectedHere = unitSeats.filter((s) => selected.has(s.id)).length;
      const freeHere = unitSeats.filter((s) => s.status === 'free' && !selected.has(s.id)).length;
      // Стол доступен, пока за ним есть хоть одно свободное место.
      const status = (freeHere + selectedHere) === 0 ? 'taken' : 'free';
      // Цифра в квадрате: сколько мест уже выбрано за этим столом, а пока
      // не выбрано ничего — сколько свободно.
      const badge = selectedHere > 0 ? selectedHere : freeHere;

      return `<div class="table-unit table-unit-pick${selectedHere ? ' selected' : ''}"
        data-label="${escapeHtml(unit.table_label)}"
        data-status="${status}"
        style="left:${unit.pos_x}%; top:${unit.pos_y}%;"
        title="${escapeHtml(unit.title)}">${badge}</div>`;
    }).join('');
  }

  // ── Окно отдельного стола (только для платных мероприятий) ──────────
  // На схеме зала стулья стоят слишком тесно для пальца, поэтому места
  // выбираются здесь: стол крупно, вокруг него его же стулья в том же
  // расположении, что и на плане.
  const tableModal = document.createElement('div');
  tableModal.className = 'table-modal';
  tableModal.hidden = true;
  tableModal.innerHTML = `
    <div class="table-modal-card" role="dialog" aria-modal="true" aria-labelledby="table-modal-title">
      <button type="button" class="table-modal-close" aria-label="Закрыть">×</button>
      <h3 class="table-modal-title" id="table-modal-title"></h3>
      <p class="table-modal-counter"></p>
      <div class="table-modal-plan"></div>
      <button type="button" class="btn btn-block table-modal-done">Готово</button>
    </div>
  `;
  document.body.appendChild(tableModal);

  const modalTitleEl = tableModal.querySelector('.table-modal-title');
  const modalCounterEl = tableModal.querySelector('.table-modal-counter');
  const modalPlanEl = tableModal.querySelector('.table-modal-plan');
  let openTableLabel = null;

  function toggleSeat(id) {
    const seat = seats.find((s) => s.id === id);
    if (!seat) return;
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      if (seat.status !== 'free') return;
      if (!canSelectMore()) return;
      selected.add(id);
    }
    renderSeats();
    renderSummary();
    if (!tableModal.hidden) renderTableModal();
  }

  function renderTableModal() {
    const unit = tableUnits().find((u) => u.table_label === openTableLabel);
    if (!unit) return closeTableModal();

    const unitSeats = unitSeatsOf(unit);
    const selectedHere = unitSeats.filter((s) => selected.has(s.id)).length;

    modalTitleEl.textContent = unit.table_label;
    modalCounterEl.textContent = isOpenEndedParty()
      ? `Выбрано за этим столом: ${selectedHere} · всего мест выбрано: ${selected.size}`
      : `Выбрано за этим столом: ${selectedHere} · всего: ${selected.size} из ${partySize}`;

    // Схема зала вытянута по ширине (4:3), поэтому одинаковые «проценты»
    // по горизонтали дают больше пикселей, чем по вертикали. Чтобы стулья
    // в окне стояли вокруг стола так же, как на плане, пересчитываем.
    const MAP_ASPECT = 4 / 3;
    const offsets = unitSeats.map((seat) => ({
      seat,
      dx: (seat.pos_x - unit.pos_x) * MAP_ASPECT,
      dy: seat.pos_y - unit.pos_y,
    }));
    const maxOffset = Math.max(...offsets.map((o) => Math.max(Math.abs(o.dx), Math.abs(o.dy)))) || 1;
    const scale = 36 / maxOffset; // стулья на 36% от центра — с запасом до краёв

    modalPlanEl.innerHTML = `<div class="table-modal-table">${escapeHtml(unit.table_label)}</div>`
      + offsets.map((o) => `${chairHtml(o.seat)}
          style="left:${50 + o.dx * scale}%; top:${50 + o.dy * scale}%;"></div>`).join('');
  }

  function openTableModal(label) {
    openTableLabel = label;
    tableModal.hidden = false;
    document.body.style.overflow = 'hidden';
    renderTableModal();
  }

  function closeTableModal() {
    tableModal.hidden = true;
    openTableLabel = null;
    document.body.style.overflow = '';
  }

  tableModal.addEventListener('click', (e) => {
    // Тап по затемнённому фону вне карточки тоже закрывает окно.
    if (e.target === tableModal
        || e.target.closest('.table-modal-close')
        || e.target.closest('.table-modal-done')) {
      closeTableModal();
      return;
    }
    const chairEl = e.target.closest('.seat');
    if (chairEl) toggleSeat(Number(chairEl.dataset.id));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !tableModal.hidden) closeTableModal();
  });

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
    if (isFreeEvent()) return;
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
    if (!tableModal.hidden) closeTableModal();
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
    // На бесплатных мероприятиях мест не выбирают: сводка не нужна, а
    // кнопку трогать нельзя — она активна с самого начала.
    if (isFreeEvent()) return;

    const count = selected.size;
    const total = event ? event.price * count : 0;
    const submitEl = formEl.querySelector('button[type="submit"]');

    if (isTicketedEvent()) {
      // Каждый стул — отдельный билет: мест берут по числу гостей, а для
      // компании «5+» — не меньше пяти и сколько нужно.
      const openEnded = isOpenEndedParty();
      const hint = (text) => `<br><span style="color:var(--text-muted);font-size:0.85rem;">${text}</span>`;

      if (!partySize) {
        summaryEl.innerHTML = 'Сначала выберите количество гостей';
      } else if (count === 0) {
        summaryEl.innerHTML = openEnded
          ? `Выберите на схеме места: минимум <strong>${partySize}</strong>`
          : `Выберите на схеме места: нужно <strong>${partySize}</strong>`;
      } else {
        const sum = `Выбрано мест: <strong>${count}</strong> · Сумма: <strong>${total} ₺</strong>`;
        if (count < partySize) {
          summaryEl.innerHTML = sum + hint(`Нужно ещё ${partySize - count}`);
        } else if (openEnded) {
          summaryEl.innerHTML = sum + hint('Можно добавить ещё места, если компания больше');
        } else {
          summaryEl.innerHTML = sum + hint('Чтобы поменять место, снимите выбор с уже выбранного');
        }
      }
      submitEl.disabled = openEnded ? count < partySize : count !== partySize;
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
      const tableEl = e.target.closest('.table-unit-pick');
      if (tableEl) {
        openTableModal(tableEl.dataset.label);
        return;
      }
      const chairEl = e.target.closest('.seat');
      if (!chairEl) return;
      toggleSeat(Number(chairEl.dataset.id));
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
  // Верхняя кнопка выбора компании — «5+», то есть пять и сколько угодно
  // больше. Для неё число мест не ограничиваем сверху, оно лишь минимум.
  const OPEN_ENDED_PARTY_SIZE = 5;
  const isOpenEndedParty = () => partySize >= OPEN_ENDED_PARTY_SIZE;
  // Платное мероприятие, у которого в админке указана внешняя страница
  // оплаты: вместо своей (тестовой) оплаты отправляем гостя туда.
  const externalPaymentUrl = () => (event && event.price > 0 && event.payment_url) || '';

  const arrivalInput = document.getElementById('arrival_time');
  const arrivalHint = document.getElementById('arrival-hint');
  arrivalHint.textContent = 'Место держится ещё 15 минут после этого времени.';

  const nameInput = document.getElementById('name');
  const emailField = document.getElementById('email-field');
  const emailInput = document.getElementById('email');
  const guestsField = document.getElementById('guests-field');
  const guestsInput = document.getElementById('guests');
  const phoneField = document.getElementById('phone-field');
  const phoneInput = document.getElementById('phone');
  const wishesField = document.getElementById('wishes-field');
  const wishesInput = document.getElementById('wishes');

  try {
    event = await Api.get(`/api/events/${eventId}`);
    titleEl.textContent = `${event.title} — ${formatDateHuman(event.event_date)} ${event.event_time}`;
    arrivalInput.value = event.event_time;
    if (isFreeEvent()) {
      submitBtn.textContent = 'Подтвердить бронь в Telegram ✈';
      submitBtn.classList.add('btn-telegram');
      submitBtn.disabled = false;
      // Бесплатные мероприятия бронируются без схемы зала: столик подбирает
      // персонал, а от гостя нужны только время, число людей, имя, телефон
      // и пожелания.
      document.querySelector('h1').textContent = 'Бронь столика';
      ['party-size-card', 'hall-map', 'booking-summary', 'waitlist-card'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      const legend = document.querySelector('.hall-legend');
      if (legend) legend.style.display = 'none';

      emailField.style.display = 'none';
      emailInput.required = false;
      guestsField.style.display = '';
      guestsInput.required = true;
      phoneField.style.display = '';
      phoneInput.required = true;
      wishesField.style.display = '';
    } else {
      // Платное мероприятие. Билеты продаёт внешняя площадка, своей оплаты у
      // сайта нет — мест мы не держим, рассадку делает персонал по купленным
      // билетам. Схему зала здесь не показываем и не грузим вовсе.
      const paymentUrl = externalPaymentUrl();
      const action = paymentUrl
        ? `<p style="margin:0 0 16px;">Билеты на это мероприятие продаются онлайн. Столик подберём для вас при входе по купленным билетам.</p>
           <a class="btn btn-block" href="${escapeHtml(paymentUrl)}" target="_blank" rel="noopener">Купить билеты</a>`
        // Ссылку на площадку забыли указать в админке — честно говорим об
        // этом вместо формы, которая всё равно ни к чему не приведёт.
        : `<p style="margin:0;">Продажа билетов на это мероприятие ещё не открыта. Загляните позже или напишите нам — подскажем, как попасть.</p>`;
      document.querySelector('main').innerHTML = `
        <a class="back-link" href="event.html?id=${encodeURIComponent(eventId)}">← К мероприятию</a>
        <h1>Билеты</h1>
        <p class="tag">${escapeHtml(event.title)} — ${formatDateHuman(event.event_date)} ${escapeHtml(event.event_time)}</p>
        <div class="card" style="padding:20px;margin-top:20px;">${action}</div>
      `;
      return;
    }
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
          if (!tableModal.hidden) renderTableModal();
        }
      } catch (e) { /* ignore */ }
    });
    ws.addEventListener('close', () => setTimeout(connectWs, 3000));
  }
  // Живое обновление занятости нужно только там, где выбирают места. Гости
  // сейчас мест не выбирают нигде (бесплатные — по форме, платные — на
  // внешней площадке), так что ветка не срабатывает; схема зала осталась в
  // коде на случай собственной продажи мест и используется в админке.
  if (!isFreeEvent()) {
    connectWs();
    // Фолбэк на случай проблем с WebSocket (например, нестабильный wifi заведения).
    setInterval(loadSeats, 15000);
  }

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
    // Сюда доходят только бесплатные мероприятия: у платных формы нет,
    // они целиком уходят на внешнюю продажу билетов.
    const name = nameInput.value.trim();
    const email = '';
    const arrivalTime = arrivalInput.value;
    submitBtn.disabled = true;
    try {
      const result = await Api.post('/api/bookings', {
        eventId: Number(eventId),
        // Столик подбирает персонал, поэтому мест не передаём.
        seatIds: [],
        name,
        email,
        arrivalTime,
        partySize: Number(guestsInput.value),
        phone: phoneInput.value.trim(),
        wishes: wishesInput.value.trim(),
      });
      if (result.telegramUrl) {
        window.open(result.telegramUrl, '_blank', 'noopener');
        formEl.innerHTML = `
          <p class="form-success">Открыли Telegram в новой вкладке — нажмите там «Start», чтобы подтвердить бронь. Место удержано за вами 10 минут.</p>
          <a class="btn btn-telegram btn-block" href="${result.telegramUrl}" target="_blank" rel="noopener">Открыть Telegram ещё раз ✈</a>
        `;
      } else {
        throw new Error('Не удалось открыть Telegram — попробуйте ещё раз');
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.className = 'form-error';
      submitBtn.disabled = false;
      if (!isFreeEvent()) {
        await loadSeats();
        renderSummary();
      }
    }
  });
});
