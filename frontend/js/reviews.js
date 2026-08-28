(function () {
  const track = document.getElementById('reviews-track');
  const marquee = track ? track.closest('.reviews-marquee') : null;
  if (!track || !marquee || !window.REVIEWS_DATA || !window.REVIEWS_DATA.length) return;

  const avatarColors = [
    '#e57373', '#f06292', '#ba68c8', '#9575cd', '#7986cb',
    '#4fc3f7', '#4dd0e1', '#4db6ac', '#81c784', '#aed581',
    '#ffb74d', '#ff8a65', '#a1887f'
  ];

  function colorFor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return avatarColors[Math.abs(hash) % avatarColors.length];
  }

  function cardHTML(review) {
    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    return (
      '<article class="review-card">' +
        '<div class="review-card-header">' +
          '<div class="review-avatar" style="background:' + colorFor(review.name) + ';">' +
            review.name.charAt(0).toUpperCase() +
          '</div>' +
          '<div>' +
            '<div class="review-name">' + review.name + '</div>' +
            '<div class="review-date">' + review.date + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="review-stars">' + stars + '</div>' +
        '<p class="review-text">' + review.text + '</p>' +
        '<a class="review-verify" href="' + review.link + '" target="_blank" rel="noopener noreferrer">Проверить →</a>' +
      '</article>'
    );
  }

  const cardsHTML = window.REVIEWS_DATA.map(cardHTML).join('');
  // Дублируем карточки, чтобы лента прокручивалась бесшовно по кругу.
  track.innerHTML = cardsHTML + cardsHTML;

  // Пользователям с prefers-reduced-motion автопрокрутку не включаем —
  // лента остаётся обычным горизонтальным скроллом (см. CSS).
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const SPEED = 36; // px/сек — скорость автопрокрутки ленты
  let setWidth = 0; // ширина одного (неудвоенного) набора карточек
  let x = 0; // текущий сдвиг ленты, всегда в диапазоне (-setWidth, 0]
  let paused = false; // наведение курсора
  let dragging = false;
  let dragMoved = false;
  let dragStartClientX = 0;
  let dragStartX = 0;
  let lastFrameTime = null;

  function measure() {
    setWidth = track.scrollWidth / 2;
  }
  measure();
  window.addEventListener('resize', measure);

  function wrap(value) {
    if (!setWidth) return value;
    let v = value % setWidth;
    if (v > 0) v -= setWidth;
    return v;
  }

  function render() {
    track.style.transform = 'translateX(' + x + 'px)';
  }

  function tick(time) {
    if (lastFrameTime === null) lastFrameTime = time;
    const dt = (time - lastFrameTime) / 1000;
    lastFrameTime = time;
    if (!dragging && !paused) {
      x = wrap(x - SPEED * dt);
      render();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  marquee.addEventListener('mouseenter', function () { paused = true; });
  marquee.addEventListener('mouseleave', function () { paused = false; });

  function pointerX(e) {
    return e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
  }

  function onPointerDown(e) {
    dragging = true;
    dragMoved = false;
    dragStartClientX = pointerX(e);
    dragStartX = x;
    track.classList.add('is-dragging');
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const delta = pointerX(e) - dragStartClientX;
    if (Math.abs(delta) > 4) dragMoved = true;
    x = wrap(dragStartX + delta);
    render();
  }

  function onPointerUp() {
    dragging = false;
    track.classList.remove('is-dragging');
    // Лента продолжает крутиться дальше с той точки, куда её сдвинули —
    // без "прыжка" обратно и без остановки автопрокрутки.
  }

  track.addEventListener('pointerdown', onPointerDown);
  track.addEventListener('pointermove', onPointerMove);
  track.addEventListener('pointerup', onPointerUp);
  track.addEventListener('pointercancel', onPointerUp);
  track.addEventListener('pointerleave', function () {
    if (dragging) onPointerUp();
  });

  // Если это было перетаскивание (а не клик), гасим переход по ссылке
  // "Проверить", чтобы палец, отпущенный над карточкой, её не открывал.
  track.addEventListener('click', function (e) {
    if (dragMoved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
})();
