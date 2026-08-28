// Отзывы для бегущей строки на главной странице.
// Собираются вручную (Google Maps не отдаёт отзывы через доступный API):
// имя, рейтинг, дата, текст — со скриншота отзыва; link — персональная
// ссылка "Поделиться отзывом" из Google Maps (три точки → Поделиться),
// ведёт читателя прямо на этот отзыв для проверки.
window.REVIEWS_DATA = [
  {
    name: 'Leisan Kamaletdinova',
    rating: 5,
    date: '27 августа 2026',
    text: 'Great place. I really love ordering croutons with kvass here. I go to stand-up comedy shows and quizzes.',
    link: 'https://maps.app.goo.gl/wEYoyHjNKoWJDBmdA?g_st=ic'
  },
  {
    name: 'Vlad Massino',
    rating: 5,
    date: '27 августа 2026',
    text: 'Миллениальный оазис посреди жары. А вообще отличный бар, отличная кухня, отличный вид, отличный персонал, все отлично!',
    // TODO: прислана та же ссылка, что и у отзыва Leisan Kamaletdinova —
    // нужна отдельная ссылка "Поделиться отзывом" именно для этого отзыва.
    link: 'https://maps.app.goo.gl/wEYoyHjNKoWJDBmdA?g_st=ic'
  },
  {
    name: 'Olga Gubar',
    rating: 5,
    date: '27 августа 2026',
    text: 'We passed by, but then returned and... didn’t regret it. Excellent draft Guinness, delicious fish platter. Don’t neglect waiter Denis’s recommendations.',
    link: 'https://maps.app.goo.gl/6VygvRyfJpuLTmnYA?g_st=ic'
  },
  {
    name: 'Даша Смирнова',
    rating: 5,
    date: '26 августа 2026',
    // Текст обрезан Google под кнопкой "more" на скриншоте — пришлите
    // полный текст, если хочется показать отзыв целиком.
    text: 'Классный ресторан, для русских, как я поняла. Цена выше среднего, думаю, платят больше за атмосферу. В принципе классно, понравилось…',
    link: 'https://maps.app.goo.gl/DEvaooNhmVhDYdA78?g_st=ic'
  },
  {
    name: 'Nazim Iskanderov',
    rating: 5,
    date: '24 августа 2026',
    text: 'A great place to have fun with friends, delicious food, liqueurs and everything in general 10/10',
    link: 'https://maps.app.goo.gl/B6MSpP7mKTanfSep7?g_st=ic'
  }
];
