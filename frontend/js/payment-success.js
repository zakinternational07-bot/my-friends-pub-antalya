document.addEventListener('DOMContentLoaded', async () => {
  const ref = new URLSearchParams(window.location.search).get('booking');
  const root = document.getElementById('success-root');

  if (!ref) {
    root.innerHTML = '<p class="form-error">Бронь не указана.</p>';
    return;
  }

  try {
    const [{ booking, event, seats }, ticket] = await Promise.all([
      Api.get(`/api/bookings/${ref}`),
      Api.get(`/api/payments/ticket/${ref}`),
    ]);
    const seatList = seats.map((s) => `${s.table_label}, место ${s.seat_number}`).join('; ');
    root.innerHTML = `
      <div class="card ticket-card">
        <span class="tag">Билет подтверждён</span>
        <h2>${escapeHtml(event.title)}</h2>
        <p>${formatDateHuman(event.event_date)} · ${escapeHtml(event.event_time)}</p>
        <p>Места: ${escapeHtml(seatList)}</p>
        <p>Гость: ${escapeHtml(booking.customer_name)}</p>
        <img src="${ticket.qrDataUrl}" alt="QR код билета" width="200" height="200" />
        <p class="ticket-ref">${escapeHtml(booking.booking_ref)}</p>
        <p>Билет с QR-кодом также отправлен на ${escapeHtml(booking.customer_email)} (тестовый режим — письмо сохранено на сервере, реально не отправлено).</p>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
  }
});
