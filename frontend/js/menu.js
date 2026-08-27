// Текстовый рендер меню из БД (категории/пункты меню, редактируются в
// админке — /api/admin/menu/*). Сейчас не используется ни на одной
// странице: все три языка меню показывают готовый дизайн картинками
// (см. menu-gallery.js). Оставлен как быстрый путь назад — например,
// если для какого-то языка ещё нет готовых страниц дизайна. Чтобы
// вернуть текстовое меню для конкретного языка — замени на этой странице
// блок #menu-gallery на `<div id="menu-root">`, подключи этот скрипт
// вместо menu-gallery.js (см. историю index-ru/en/tr.html до перехода на
// картинки в git/бэкапе, если он есть).
document.addEventListener('DOMContentLoaded', async () => {
  const lang = document.body.dataset.lang || 'ru';
  const root = document.getElementById('menu-root');
  if (!root) return;

  try {
    const categories = await Api.get(`/api/menu?lang=${lang}`);
    if (!categories.length) {
      root.innerHTML = '<p class="empty-state">Меню скоро появится</p>';
      return;
    }
    root.innerHTML = categories.map((cat) => `
      <div class="menu-category">
        <h2>${escapeHtml(cat.name)}</h2>
        ${cat.items.map((item) => `
          <div class="menu-item">
            <div class="menu-item-info">
              <h4>${escapeHtml(item.name)}</h4>
              ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
            </div>
            <div class="menu-item-price">${item.price} ₺</div>
          </div>
        `).join('')}
      </div>
    `).join('');
  } catch (err) {
    root.innerHTML = `<p class="form-error">Не удалось загрузить меню: ${escapeHtml(err.message)}</p>`;
  }
});
