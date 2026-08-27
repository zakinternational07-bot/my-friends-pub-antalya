document.addEventListener('DOMContentLoaded', async () => {
  const me = await initAdminShell('dashboard');
  if (!me) return;

  const root = document.getElementById('dashboard-root');
  try {
    const [events, bookings, categories] = await Promise.all([
      Api.get('/api/admin/events'),
      Api.get('/api/admin/bookings'),
      Api.get('/api/admin/menu/categories'),
    ]);
    const paid = bookings.filter((b) => b.status === 'paid');
    const revenue = paid.reduce((sum, b) => sum + b.total_price, 0);

    root.innerHTML = `
      <div class="event-grid">
        <div class="card" style="padding:20px;"><h3>${events.length}</h3><p>мероприятий в базе</p></div>
        <div class="card" style="padding:20px;"><h3>${categories.length}</h3><p>категорий меню</p></div>
        <div class="card" style="padding:20px;"><h3>${paid.length}</h3><p>оплаченных броней</p></div>
        <div class="card" style="padding:20px;"><h3>${revenue} ₺</h3><p>выручка (тестовый режим)</p></div>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
  }
});
