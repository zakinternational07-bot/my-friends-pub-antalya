// Видео-фон главной страницы. Главная задача — не мешать телефону: пока
// страница грузится, видно только лёгкий постер (15 КБ), а само видео
// (~1 МБ) начинает качаться уже после того, как страница загрузилась.
// Если условия неподходящие (экономия трафика, медленная сеть, просьба
// уменьшить анимацию, старый браузер без webm/mp4) — просто остаёмся на
// постере: страница в любом случае выглядит как раньше.
(function () {
  const video = document.getElementById('hero-video');
  if (!video) return;

  function prefersLessMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // В браузерах Android есть navigator.connection: режим экономии трафика
  // и тип сети. На медленной сети мегабайт фонового видео только мешает
  // открыть страницу, поэтому его не грузим.
  function connectionTooSlow() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return false;
    if (c.saveData) return true;
    return ['slow-2g', '2g'].includes(c.effectiveType);
  }

  // На телефоне фон растягивается на узкий экран и вдобавок размывается,
  // поэтому там мелкого файла достаточно — он вдвое легче.
  function isPhone() {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  }

  function pickSource() {
    const d = video.dataset;
    const phone = isPhone();
    // Safari на iOS младше 16 не умеет webm — для таких устройств есть mp4.
    const canWebm = video.canPlayType('video/webm; codecs="vp9"')
      || video.canPlayType('video/webm');
    if (canWebm) return phone ? (d.webmSmall || d.webm) : d.webm;
    if (video.canPlayType('video/mp4; codecs="avc1.4D401E"') || video.canPlayType('video/mp4')) {
      return phone ? (d.mp4Small || d.mp4) : d.mp4;
    }
    return null;
  }

  function startVideo() {
    if (prefersLessMotion() || connectionTooSlow()) return;

    const src = pickSource();
    if (!src) return;

    video.src = src;
    video.load();

    // Проявляем видео только когда оно реально пошло, иначе можно поймать
    // чёрный кадр поверх постера.
    video.addEventListener('playing', () => video.classList.add('is-playing'), { once: true });

    // Автовоспроизведение могут заблокировать (режим энергосбережения на
    // iPhone, настройки браузера). Это не ошибка — молча остаёмся на постере.
    const played = video.play();
    if (played && typeof played.catch === 'function') {
      played.catch(() => {
        video.classList.remove('is-playing');
      });
    }
  }

  // Не тянем видео параллельно с остальной страницей: ждём полной загрузки,
  // так текст, кнопки и меню появляются раньше.
  if (document.readyState === 'complete') startVideo();
  else window.addEventListener('load', startVideo, { once: true });

  // Пока вкладка свёрнута, видео крутить незачем — экономим батарею телефона.
  document.addEventListener('visibilitychange', () => {
    if (!video.src) return;
    if (document.hidden) video.pause();
    else video.play().catch(() => {});
  });
})();
