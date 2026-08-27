document.addEventListener('DOMContentLoaded', async () => {
  const ref = new URLSearchParams(window.location.search).get('booking');
  const root = document.getElementById('payment-root');

  if (!ref) {
    root.innerHTML = '<p class="form-error">Бронь не указана.</p>';
    return;
  }

  async function load() {
    const { booking, event, seats } = await Api.get(`/api/bookings/${ref}`);
    if (booking.status === 'paid') {
      window.location.href = `payment-success.html?booking=${ref}`;
      return;
    }
    if (booking.status !== 'held') {
      root.innerHTML = '<p class="form-error">Бронь просрочена или отменена. Вернитесь к мероприятию и выберите места заново.</p>';
      return;
    }

    const seatList = seats.map((s) => `${s.table_label}, место ${s.seat_number}`).join('; ');
    root.innerHTML = `
      <div class="card" style="padding:24px;">
        <h2>${escapeHtml(event.title)}</h2>
        <p>${formatDateHuman(event.event_date)} · ${escapeHtml(event.event_time)}</p>
        <p>Места: ${escapeHtml(seatList)}</p>
        <p>Гость: ${escapeHtml(booking.customer_name)} (${escapeHtml(booking.customer_email)})</p>
        <h3>Итого: ${booking.total_price} ₺</h3>
        <p id="payment-timer" class="tag"></p>
        <button id="confirm-btn" class="btn btn-block">Оплатить (тестовый режим)</button>
        <p id="payment-error" class="form-error" style="display:none;"></p>
      </div>
    `;

    const timerEl = document.getElementById('payment-timer');
    const expiresAt = new Date(booking.hold_expires_at).getTime();
    const tick = () => {
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        timerEl.textContent = 'Время брони истекло';
        document.getElementById('confirm-btn').disabled = true;
        clearInterval(intervalId);
        return;
      }
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000).toString().padStart(2, '0');
      timerEl.textContent = `Бронь действует ещё ${mins}:${secs}`;
    };
    tick();
    const intervalId = setInterval(tick, 1000);

    document.getElementById('confirm-btn').addEventListener('click', async () => {
      const btn = document.getElementById('confirm-btn');
      const errEl = document.getElementById('payment-error');
      btn.disabled = true;
      errEl.style.display = 'none';
      try {
        await Api.post('/api/payments/mock/confirm', { bookingRef: ref });
        clearInterval(intervalId);
        window.location.href = `payment-success.html?booking=${ref}`;
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        btn.disabled = false;
      }
    });
  }

  try {
    await load();
  } catch (err) {
    root.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
  }
});
