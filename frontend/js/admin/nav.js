// Общая проверка авторизации и рендер бокового меню для всех страниц админки.
async function initAdminShell(activePage) {
  let me;
  try {
    me = await Api.get('/api/auth/me');
  } catch (err) {
    window.location.href = 'login.html';
    return null;
  }
  if (!me.authenticated) {
    window.location.href = 'login.html';
    return null;
  }

  const links = [
    { href: 'dashboard.html', label: 'Обзор', key: 'dashboard' },
    { href: 'events.html', label: 'Мероприятия', key: 'events' },
    { href: 'menu.html', label: 'Меню', key: 'menu' },
    { href: 'hall.html', label: 'План зала', key: 'hall' },
    { href: 'bookings.html', label: 'Брони', key: 'bookings' },
  ];

  const nav = document.getElementById('admin-nav');
  nav.innerHTML = `
    <div class="logo" style="padding:0 24px 20px;">Admin</div>
    ${links.map((l) => `<a href="${l.href}" class="${l.key === activePage ? 'active' : ''}">${l.label}</a>`).join('')}
    <a href="#" id="admin-logout" style="margin-top:20px;">Выйти (${escapeHtml(me.username)})</a>
  `;
  document.getElementById('admin-logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await Api.post('/api/auth/logout');
    window.location.href = 'login.html';
  });

  return me;
}
