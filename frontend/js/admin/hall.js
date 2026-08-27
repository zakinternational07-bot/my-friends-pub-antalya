document.addEventListener('DOMContentLoaded', async () => {
  const me = await initAdminShell('hall');
  if (!me) return;

  const textarea = document.getElementById('hall-json');
  const preview = document.getElementById('hall-preview');
  const errorEl = document.getElementById('hall-error');
  const form = document.getElementById('hall-form');

  function renderPreview(seats) {
    preview.innerHTML = seats.map((s) => `
      <div class="seat" data-status="free" style="left:${s.pos_x}%; top:${s.pos_y}%;" title="${escapeHtml(s.table_label)} ${s.seat_number}"></div>
    `).join('');
  }

  let seats = [];
  try {
    seats = await Api.get('/api/admin/hall');
    textarea.value = JSON.stringify(
      seats.map(({ table_label, seat_number, pos_x, pos_y }) => ({ table_label, seat_number, pos_x, pos_y })),
      null, 2
    );
    renderPreview(seats);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }

  textarea.addEventListener('input', () => {
    try {
      const parsed = JSON.parse(textarea.value);
      renderPreview(parsed);
      errorEl.style.display = 'none';
    } catch (e) {
      // подождём, пока пользователь допишет валидный JSON
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    let parsed;
    try {
      parsed = JSON.parse(textarea.value);
    } catch (err) {
      errorEl.textContent = 'Некорректный JSON: ' + err.message;
      errorEl.style.display = 'block';
      return;
    }
    try {
      const result = await Api.put('/api/admin/hall', { seats: parsed });
      alert(`Сохранено, мест: ${result.count}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
});
