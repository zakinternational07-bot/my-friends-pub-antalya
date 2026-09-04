function formatAvg(stats, key) {
  return stats && stats.n ? Number(stats[key]).toFixed(1) : '—';
}

function statsCard(title, stats) {
  return `
    <div class="card" style="padding:20px;">
      <h3 style="margin:0 0 4px;">${stats && stats.n ? stats.n : 0}</h3>
      <p style="margin:0 0 12px;">${title}</p>
      <p style="margin:0;color:var(--text-muted);font-size:0.85rem;line-height:1.6;">
        Обслуживание: ${formatAvg(stats, 'service')}<br>
        Еда: ${formatAvg(stats, 'food')}<br>
        Напитки: ${formatAvg(stats, 'drinks')}<br>
        Общее впечатление: ${formatAvg(stats, 'overall')}
      </p>
    </div>
  `;
}

// Клик по Telegram-username гостя открывает переписку с ним напрямую —
// без username показываем email, а если и его нет (бесплатная бронь без
// подтверждения через бота), явно пишем, что связаться нечем.
function contactCell(r) {
  if (r.telegram_username) return `<a href="https://t.me/${escapeHtml(r.telegram_username)}" target="_blank" rel="noopener">@${escapeHtml(r.telegram_username)}</a>`;
  if (r.customer_email) return escapeHtml(r.customer_email);
  return '<span style="color:var(--text-muted);">нет контакта</span>';
}

document.addEventListener('DOMContentLoaded', async () => {
  const me = await initAdminShell('surveys');
  if (!me) return;

  const root = document.getElementById('surveys-admin-root');
  try {
    const { rows, allTime, last7d } = await Api.get('/api/admin/surveys');

    root.innerHTML = `
      <div class="event-grid" style="margin-bottom:24px;">
        ${statsCard('отзывов за 7 дней', last7d)}
        ${statsCard('отзывов за всё время', allTime)}
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Мероприятие</th><th>Гость</th><th>Контакт</th><th>Обсл.</th><th>Еда</th><th>Напитки</th><th>Общее</th><th>Отзыв</th><th>Когда</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const isLow = [r.rating_service, r.rating_food, r.rating_drinks, r.rating_overall].some((n) => n <= 3);
              return `
              <tr${isLow ? ' style="background:rgba(224,57,63,0.08);"' : ''}>
                <td>${isLow ? '⚠️ ' : ''}${escapeHtml(r.event_title)}<br><span style="color:var(--text-muted);font-size:0.8rem;">${escapeHtml(r.event_date)}</span></td>
                <td>${escapeHtml(r.customer_name)}</td>
                <td>${contactCell(r)}</td>
                <td>${r.rating_service}</td>
                <td>${r.rating_food}</td>
                <td>${r.rating_drinks}</td>
                <td>${r.rating_overall}</td>
                <td style="max-width:280px;white-space:pre-wrap;">${r.comment ? escapeHtml(r.comment) : '<span style="color:var(--text-muted);">—</span>'}</td>
                <td>${escapeHtml(r.submitted_at)}</td>
              </tr>
            `;
            }).join('') || '<tr><td colspan="9">Отзывов пока нет</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
  }
});
