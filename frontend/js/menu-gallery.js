// Просмотрщик готового дизайнерского меню (сканы/экспорт страниц как
// картинки). Список страниц и путь к картинкам задаются атрибутами на
// #menu-gallery (data-base, data-pages, data-alt, data-close-label,
// data-zoom-hint), чтобы один и тот же скрипт работал для всех языковых
// версий меню. Тап по странице открывает её на весь экран (для гостей с
// плохим зрением) — с крестиком в правом верхнем углу, чтобы выйти.
// Листание везде зациклено: с последней страницы — сразу на первую и
// наоборот. В полноэкранном режиме отдельных стрелок нет — тап по
// правой половине картинки листает вперёд, по левой — назад, а двумя
// пальцами можно увеличить картинку (pinch-to-zoom) и подвигать её.
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
      resetZoom();
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

  // Тап по правой половине картинки (мышью, не тачем) — вперёд, по левой — назад.
  // На тачскринах это же решает touchend ниже; preventDefault там гасит
  // синтетический click, чтобы страница не листалась дважды.
  lightboxImg.addEventListener('click', (e) => {
    if (scale > 1) return;
    const rect = lightboxImg.getBoundingClientRect();
    const clickedRight = e.clientX - rect.left > rect.width / 2;
    goTo(clickedRight ? index + 1 : index - 1);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') goTo(index - 1);
    if (e.key === 'ArrowRight') goTo(index + 1);
    if (e.key === 'Escape' && lightboxOpen) closeLightbox();
  });

  // --- Pinch-to-zoom и панорамирование двумя/одним пальцем в полноэкранном режиме ---
  let scale = 1;
  let panX = 0;
  let panY = 0;

  function applyTransform() {
    lightboxImg.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function resetZoom() {
    scale = 1;
    panX = 0;
    panY = 0;
    lightboxImg.style.transform = '';
  }

  function touchDistance(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }

  let pinchStartDist = null;
  let pinchStartScale = 1;
  let panStart = null;
  let tapStartX = null;

  lightbox.addEventListener('touchstart', (e) => {
    // Жест должен начинаться на самой картинке — иначе тап по крестику
    // или по тёмному фону вокруг тоже листал бы страницу вместо закрытия.
    if (e.target !== lightboxImg) {
      pinchStartDist = null;
      panStart = null;
      tapStartX = null;
      return;
    }
    if (e.touches.length === 2) {
      pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
      pinchStartScale = scale;
      panStart = null;
      tapStartX = null;
    } else if (e.touches.length === 1) {
      if (scale > 1) {
        panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX, panY };
      } else {
        tapStartX = e.touches[0].clientX;
      }
    }
  }, { passive: true });

  lightbox.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDist) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const newDist = touchDistance(t1, t2);
      const newScale = Math.min(4, Math.max(1, pinchStartScale * (newDist / pinchStartDist)));

      // Держим под пальцами ту же точку картинки, что была под ними до
      // этого — иначе увеличение всегда шло бы от центра, а не от места,
      // где реально сводят пальцы. rect берём ДО обновления scale, чтобы
      // он ещё отражал текущий (предыдущий) масштаб/сдвиг.
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const rect = lightboxImg.getBoundingClientRect();
      const k = newScale / scale;
      panX += (midX - rect.left) * (1 - k);
      panY += (midY - rect.top) * (1 - k);
      scale = newScale;
      applyTransform();
    } else if (panStart && e.touches.length === 1) {
      e.preventDefault();
      panX = panStart.panX + (e.touches[0].clientX - panStart.x);
      panY = panStart.panY + (e.touches[0].clientY - panStart.y);
      applyTransform();
    }
  }, { passive: false });

  lightbox.addEventListener('touchend', (e) => {
    if (e.touches.length > 0) return; // ждём, пока отпустят все пальцы
    pinchStartDist = null;

    if (panStart) {
      panStart = null;
    } else if (tapStartX != null && scale === 1) {
      const dx = e.changedTouches[0].clientX - tapStartX;
      if (Math.abs(dx) > 40) {
        e.preventDefault();
        goTo(dx < 0 ? index + 1 : index - 1);
      } else {
        e.preventDefault();
        const rect = lightboxImg.getBoundingClientRect();
        const tappedRight = e.changedTouches[0].clientX - rect.left > rect.width / 2;
        goTo(tappedRight ? index + 1 : index - 1);
      }
    }
    tapStartX = null;

    // Возвращаем к исходному размеру, если почти не увеличили.
    if (scale < 1.05) resetZoom();
  });

  // Свайп для тачскринов на компактном (не полноэкранном) просмотрщике.
  function attachSwipe(el) {
    let touchStartX = null;
    el.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (touchStartX == null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) {
        goTo(dx < 0 ? index + 1 : index - 1);
      }
      touchStartX = null;
    });
  }
  attachSwipe(viewer);

  // Подсказка «нажмите, чтобы увеличить» на самой странице меню.
  const zoomHintEl = document.createElement('span');
  zoomHintEl.className = 'menu-gallery-zoom-hint';
  zoomHintEl.textContent = ZOOM_HINT;
  imgEl.closest('.menu-gallery-frame').appendChild(zoomHintEl);

  render();
});
