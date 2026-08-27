document.addEventListener('DOMContentLoaded', async () => {
  const me = await initAdminShell('menu');
  if (!me) return;

  const root = document.getElementById('menu-admin-root');

  async function render() {
    const [categories, items] = await Promise.all([
      Api.get('/api/admin/menu/categories'),
      Api.get('/api/admin/menu/items'),
    ]);

    root.innerHTML = `
      <div class="card" style="padding:20px;margin-bottom:24px;">
        <h3>Новая категория</h3>
        <form id="cat-form">
          <div class="form-field"><label>Название RU</label><input name="name_ru" required /></div>
          <div class="form-field"><label>Название EN</label><input name="name_en" required /></div>
          <div class="form-field"><label>Название TR</label><input name="name_tr" required /></div>
          <div class="form-field"><label>Порядок сортировки</label><input name="sort_order" type="number" value="0" /></div>
          <button type="submit" class="btn">Добавить категорию</button>
        </form>
      </div>

      ${categories.map((cat) => `
        <div class="card" style="padding:20px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h3>${escapeHtml(cat.name_ru)} / ${escapeHtml(cat.name_en)} / ${escapeHtml(cat.name_tr)}</h3>
            <button class="delete-cat-btn" data-id="${cat.id}">Удалить категорию</button>
          </div>
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead><tr><th>RU</th><th>EN</th><th>TR</th><th>Цена</th><th></th></tr></thead>
              <tbody>
                ${items.filter((i) => i.category_id === cat.id).map((i) => `
                  <tr>
                    <td>${escapeHtml(i.name_ru)}</td>
                    <td>${escapeHtml(i.name_en)}</td>
                    <td>${escapeHtml(i.name_tr)}</td>
                    <td>${i.price} ₺</td>
                    <td class="admin-row-actions"><button class="delete-item-btn" data-id="${i.id}">Удалить</button></td>
                  </tr>
                `).join('') || '<tr><td colspan="5">Пунктов пока нет</td></tr>'}
              </tbody>
            </table>
          </div>
          <details style="margin-top:14px;">
            <summary>+ Добавить пункт меню</summary>
            <form class="item-form" data-category="${cat.id}" style="margin-top:12px;">
              <div class="form-field"><label>Название RU</label><input name="name_ru" required /></div>
              <div class="form-field"><label>Название EN</label><input name="name_en" required /></div>
              <div class="form-field"><label>Название TR</label><input name="name_tr" required /></div>
              <div class="form-field"><label>Описание RU</label><input name="description_ru" /></div>
              <div class="form-field"><label>Описание EN</label><input name="description_en" /></div>
              <div class="form-field"><label>Описание TR</label><input name="description_tr" /></div>
              <div class="form-field"><label>Цена (₺)</label><input name="price" type="number" min="0" step="1" required /></div>
              <button type="submit" class="btn">Добавить пункт</button>
            </form>
          </details>
        </div>
      `).join('') || '<p class="empty-state">Категорий пока нет</p>'}
    `;

    document.getElementById('cat-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      await Api.post('/api/admin/menu/categories', {
        name_ru: f.name_ru.value, name_en: f.name_en.value, name_tr: f.name_tr.value,
        sort_order: Number(f.sort_order.value) || 0,
      });
      render();
    });

    root.querySelectorAll('.delete-cat-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить категорию вместе со всеми пунктами меню в ней?')) return;
        await Api.del(`/api/admin/menu/categories/${btn.dataset.id}`);
        render();
      });
    });

    root.querySelectorAll('.delete-item-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await Api.del(`/api/admin/menu/items/${btn.dataset.id}`);
        render();
      });
    });

    root.querySelectorAll('.item-form').forEach((f) => {
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        await Api.post('/api/admin/menu/items', {
          category_id: Number(f.dataset.category),
          name_ru: f.name_ru.value, name_en: f.name_en.value, name_tr: f.name_tr.value,
          description_ru: f.description_ru.value, description_en: f.description_en.value, description_tr: f.description_tr.value,
          price: Number(f.price.value) || 0,
        });
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
