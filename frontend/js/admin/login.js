document.addEventListener('DOMContentLoaded', async () => {
  try {
    const me = await Api.get('/api/auth/me');
    if (me.authenticated) {
      window.location.href = 'dashboard.html';
      return;
    }
  } catch (e) { /* ignore, show login form */ }

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    try {
      await Api.post('/api/auth/login', {
        username: form.username.value.trim(),
        password: form.password.value,
      });
      window.location.href = 'dashboard.html';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
});
