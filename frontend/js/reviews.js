(function () {
  const track = document.getElementById('reviews-track');
  if (!track || !window.REVIEWS_DATA || !window.REVIEWS_DATA.length) return;

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
  // Скорость ленты растёт вместе с числом отзывов, чтобы темп прокрутки
  // оставался одинаковым и после добавления новых карточек.
  track.style.animationDuration = (window.REVIEWS_DATA.length * 6) + 's';
})();
