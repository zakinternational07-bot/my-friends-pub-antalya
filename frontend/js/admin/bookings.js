document.addEventListener('DOMContentLoaded', async () => {
  const me = await initAdminShell('bookings');
  if (!me) return;

  const root = document.getElementById('bookings-admin-root');
  try {
    const bookings = await Api.get('/api/admin/bookings');
    root.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Бронь</th><th>Мероприятие</th><th>Гость</th><th>Email</th><th>Приход</th><th>Сумма</th><th>Статус</th><th>Явка</th><th>Создана</th></tr></thead>
          <tbody>
            ${bookings.map((b) => `
              <tr>
                <td>${escapeHtml(b.booking_ref)}</td>
                <td>${escapeHtml(b.event_title)}<br><span style="color:var(--text-muted);font-size:0.8rem;">${b.event_date} ${b.event_time}</span></td>
                <td>${escapeHtml(b.customer_name)}</td>
                <td>${escapeHtml(b.customer_email)}</td>
                <td>${b.arrival_time ? escapeHtml(b.arrival_time) : '—'}</td>
                <td>${b.total_price} ₺</td>
                <td><span class="status-badge ${b.status}">${b.status}</span></td>
                <td>${b.telegram_chat_id ? `<span class="status-badge ${b.attendance_status}">${b.attendance_status}</span>` : '<span style="color:var(--text-muted);">—</span>'}</td>
                <td>${b.created_at}</td>
              </tr>
            `).join('') || '<tr><td colspan="9">Броней пока нет</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
  }
});
