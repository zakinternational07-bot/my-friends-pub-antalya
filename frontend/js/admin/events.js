document.addEventListener('DOMContentLoaded', async () => {
  const me = await initAdminShell('events');
  if (!me) return;

  const root = document.getElementById('events-admin-root');

  async function render() {
    const events = await Api.get('/api/admin/events');
    root.innerHTML = `
      <p><a class="btn" href="event-edit.html">+ Новое мероприятие</a></p>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Дата</th><th>Название</th><th>Цена</th><th></th></tr></thead>
          <tbody>
            ${events.map((ev) => `
              <tr>
                <td>${ev.event_date} ${ev.event_time}</td>
                <td>${escapeHtml(ev.title)}</td>
                <td>${ev.price} ₺</td>
                <td class="admin-row-actions">
                  <a href="event-edit.html?id=${ev.id}">Редактировать</a>
                  <button data-id="${ev.id}" class="delete-btn">Удалить</button>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="4">Мероприятий пока нет</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    root.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить мероприятие?')) return;
        await Api.del(`/api/admin/events/${btn.dataset.id}`);
        render();
      });
    });
  }

  try {
    await render();
  } catch (err) {
    root.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
  }
});
