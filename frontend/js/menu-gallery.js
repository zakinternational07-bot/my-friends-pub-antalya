// Просмотрщик готового дизайнерского меню (сканы/экспорт страниц как
// картинки). Список страниц и путь к картинкам задаются атрибутами на
// #menu-gallery (data-base, data-pages, data-alt, data-close-label,
// data-zoom-hint), чтобы один и тот же скрипт работал для всех языковых
// версий меню. Тап по странице открывает её на весь экран (для гостей с
// плохим зрением) — с крестиком в правом верхнем углу, чтобы выйти.
// Листание везде зациклено: с последней страницы — сразу на первую и
// наоборот. В полноэкранном режиме отдельных стрелок нет — тап по
// правой половине картинки листает вперёд, по левой — назад.
document.addEventListener('DOMContentLoaded', () => {
  const viewer = document.getElementById('menu-gallery');
  if (!viewer) return;

  const BASE_PATH = viewer.dataset.base;
  const PAGE_NUMBERS = viewer.dataset.pages.split(',').map((n) => n.trim());
  const ALT_PREFIX = viewer.dataset.alt || 'Menu page';
  const CLOSE_LABEL = viewer.dataset.closeLabel || 'Close';
  const ZOOM_HINT = viewer.dataset.zoomHint || 'Tap to enlarge';

  const imgEl = document.getElementById('menu-gallery-img');
  const counterEl = document.getElementById('menu-gallery-counter');
  const prevBtn = document.getElementById('menu-gallery-prev');
  const nextBtn = document.getElementById('menu-gallery-next');

  let index = 0;
  let lightboxOpen = false;

  function pageSrc(i) {
    return `${BASE_PATH}${PAGE_NUMBERS[i]}.jpg`;
  }

  function preload(i) {
    const wrapped = (i + PAGE_NUMBERS.length) % PAGE_NUMBERS.length;
    const img = new Image();
    img.src = pageSrc(wrapped);
  }

  function render() {
    const alt = `${ALT_PREFIX} ${index + 1} / ${PAGE_NUMBERS.length}`;
    imgEl.classList.remove('loaded');
    imgEl.src = pageSrc(index);
    imgEl.alt = alt;
    counterEl.textContent = `${index + 1} / ${PAGE_NUMBERS.length}`;
    preload(index - 1);
    preload(index + 1);

    if (lightboxOpen) {
      lightboxImg.src = pageSrc(index);
      lightboxImg.alt = alt;
      lightboxCounter.textContent = `${index + 1} / ${PAGE_NUMBERS.length}`;
    }
  }

  imgEl.addEventListener('load', () => imgEl.classList.add('loaded'));

  // Листание зациклено: после последней страницы — снова первая, и наоборот.
  function goTo(newIndex) {
    index = (newIndex + PAGE_NUMBERS.length) % PAGE_NUMBERS.length;
    render();
  }

  prevBtn.addEventListener('click', () => goTo(index - 1));
  nextBtn.addEventListener('click', () => goTo(index + 1));

  // --- Полноэкранный просмотр по тапу на страницу ---
  const lightbox = document.createElement('div');
  lightbox.className = 'menu-lightbox';
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.hidden = true;
  lightbox.innerHTML = `
    <button type="button" class="menu-lightbox-close" aria-label="${CLOSE_LABEL}">×</button>
    <img class="menu-lightbox-img" alt="" />
    <p class="menu-lightbox-counter"></p>
  `;
  document.body.appendChild(lightbox);

  const lightboxImg = lightbox.querySelector('.menu-lightbox-img');
  const lightboxCounter = lightbox.querySelector('.menu-lightbox-counter');
  const lightboxCloseBtn = lightbox.querySelector('.menu-lightbox-close');

  let lastFocused = null;

  function openLightbox() {
    lightboxOpen = true;
    lightbox.hidden = false;
    document.body.classList.add('menu-lightbox-active');
    lastFocused = document.activeElement;
    lightboxCloseBtn.focus();
    render();
  }

  function closeLightbox() {
    lightboxOpen = false;
    lightbox.hidden = true;
    document.body.classList.remove('menu-lightbox-active');
    if (lastFocused) lastFocused.focus();
  }

  imgEl.closest('.menu-gallery-frame').addEventListener('click', openLightbox);
  lightboxCloseBtn.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  // Тап по правой половине картинки — вперёд, по левой — назад.
  lightboxImg.addEventListener('click', (e) => {
    const rect = lightboxImg.getBoundingClientRect();
    const clickedRight = e.clientX - rect.left > rect.width / 2;
    goTo(clickedRight ? index + 1 : index - 1);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') goTo(index - 1);
    if (e.key === 'ArrowRight') goTo(index + 1);
    if (e.key === 'Escape' && lightboxOpen) closeLightbox();
  });

  // Свайп для тачскринов — работает и в обычном режиме, и в полноэкранном.
  // preventDefault на touchend после свайпа глушит синтетический click,
  // который иначе следом сработал бы как тап по левой/правой половине.
  function attachSwipe(el) {
    let touchStartX = null;
    el.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (touchStartX == null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) {
        e.preventDefault();
        goTo(dx < 0 ? index + 1 : index - 1);
      }
      touchStartX = null;
    });
  }
  attachSwipe(viewer);
  attachSwipe(lightbox);

  // Подсказка «нажмите, чтобы увеличить» на самой странице меню.
  const zoomHintEl = document.createElement('span');
  zoomHintEl.className = 'menu-gallery-zoom-hint';
  zoomHintEl.textContent = ZOOM_HINT;
  imgEl.closest('.menu-gallery-frame').appendChild(zoomHintEl);

  render();
});
