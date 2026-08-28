// Отзывы для бегущей строки на главной странице.
// Собираются вручную (Google Maps не отдаёт отзывы через доступный API):
// имя, рейтинг, дата, текст — со скриншота отзыва; link — персональная
// ссылка "Поделиться отзывом" из Google Maps (три точки → Поделиться),
// ведёт читателя прямо на этот отзыв для проверки.
window.REVIEWS_DATA = [
  {
    name: 'Leisan Kamaletdinova',
    rating: 5,
    date: '27.08.2026',
    text: 'Great place. I really love ordering croutons with kvass here. I go to stand-up comedy shows and quizzes.',
    link: 'https://maps.app.goo.gl/wEYoyHjNKoWJDBmdA?g_st=ic'
  },
  {
    name: 'Vlad Massino',
    rating: 5,
    date: '27.08.2026',
    text: 'Миллениальный оазис посреди жары. А вообще отличный бар, отличная кухня, отличный вид, отличный персонал, все отлично!',
    link: 'https://maps.app.goo.gl/KBCK9UcHYo6WUqJSA?g_st=ic'
  },
  {
    name: 'Olga Gubar',
    rating: 5,
    date: '27.08.2026',
    text: 'We passed by, but then returned and... didn’t regret it. Excellent draft Guinness, delicious fish platter. Don’t neglect waiter Denis’s recommendations.',
    link: 'https://maps.app.goo.gl/6VygvRyfJpuLTmnYA?g_st=ic'
  },
  {
    name: 'Даша Смирнова',
    rating: 5,
    date: '26.08.2026',
    // Текст обрезан Google под кнопкой "more" на скриншоте — пришлите
    // полный текст, если хочется показать отзыв целиком.
    text: 'Классный ресторан, для русских, как я поняла. Цена выше среднего, думаю, платят больше за атмосферу. В принципе классно, понравилось…',
    link: 'https://maps.app.goo.gl/DEvaooNhmVhDYdA78?g_st=ic'
  },
  {
    name: 'Nazim Iskanderov',
    rating: 5,
    date: '24.08.2026',
    text: 'A great place to have fun with friends, delicious food, liqueurs and everything in general 10/10',
    link: 'https://maps.app.goo.gl/B6MSpP7mKTanfSep7?g_st=ic'
  },
  {
    name: 'space',
    rating: 5,
    date: '24.08.2026',
    text: 'We love it! Awesome bar, amazing food! The BEST staff, we’ve been coming here for three years now and we’ve never been disappointed.',
    link: 'https://maps.app.goo.gl/3EZ2p5qBoo7Rsr5G6?g_st=ic'
  },
  {
    name: 'Alisa Parker',
    rating: 5,
    date: '24.08.2026',
    text: 'Очень атмосферно, красивый вид на море, музыка, большое меню, очень вкусно, особенно супер если хочется еды, которая приготовлена как в России)',
    link: 'https://maps.app.goo.gl/uMSeaxFhiwUm5KFFA?g_st=ic'
  },
  {
    name: 'Александр Ходырев',
    rating: 5,
    date: '22.08.2026',
    text: 'The place is very good looking with nice music and tasty food.',
    link: 'https://maps.app.goo.gl/vy6FEC9zkpuDrXCdA?g_st=ic'
  },
  {
    name: 'Мила Х',
    rating: 5,
    date: '22.08.2026',
    text: 'Очень приятное место. Были здесь год назад. Классная атмосфера. Вечером живая музыка. Вид на море.',
    link: 'https://maps.app.goo.gl/XZutUvEGBPmDnc568?g_st=ic'
  },
  {
    name: '是素裳呀!',
    rating: 5,
    date: '22.08.2026',
    // Оригинал на китайском, переведено вручную; текст обрезан Google
    // под кнопкой "more" на скриншоте.
    text: 'Еда довольно вкусная, скажем так. Цена немного высоковата, но у моря это объяснимо. Официанты, похоже, были заняты, обслуживание не очень…',
    link: 'https://maps.app.goo.gl/eKdBnSDKr2EG6pcYA?g_st=ic'
  },
  {
    name: 'Megan Ryan',
    rating: 5,
    date: '28.05.2026',
    text: 'If you are looking for more than a meal, go visit Dennis at this pub. Service was extremely excellent. Burgers are so juicy that they provide gloves for eating. Fried black bread was better than fries. Shout out to Dennis from your Canadian friends! Lots of laughs!',
    link: 'https://maps.app.goo.gl/PxCq6SsaH1iHJ8m49?g_st=ic'
  },
  {
    name: 'Andy Hayman',
    rating: 5,
    date: '28.08.2025',
    text: 'My wife and I were taking a walk through the old town and we got talking to Dennis who works at My Friends Pub. He very kindly let us try his pubs food and drink and it was exceptional. The place itself is absolutely beautiful with such amazing views of the sea and surrounding beaches. Cannot rate this place highly enough - you must try it out for yourself!',
    link: 'https://maps.app.goo.gl/u3FZSxSrRKEsX4PD6?g_st=ic'
  },
  {
    name: 'Jessica Oehme',
    rating: 5,
    date: '28.09.2025',
    text: 'Such a nice atmosphere. Would recommend coming here before the sun sets as you can watch the sun setting right in the restaurant. Such a pretty view. The food was good and they have such good and creative drinks! Could use some work on the vegetarian menu though. Service was super quick and friendly. Nice live music too!',
    link: 'https://maps.app.goo.gl/gsisyM9YxYCVUT7F9?g_st=ic'
  },
  {
    name: 'Renk Rüzgar Ece',
    rating: 5,
    date: '28.03.2026',
    text: 'Barmen Deniz Bey’in müthiş servisi ve ortamın kalitesi gerçekten mükemmel. Daha içeri adım attığınız anda hem ilgi hem de profesyonellik hissediliyor. Servis hızlı, içecekler özenle hazırlanıyor ve çalışanların yaklaşımı oldukça samimi. Ayrıca mekânın manzarası da ayrı bir keyif katıyor. Özellikle akşam saatlerinde manzaraya karşı oturup bir şeyler içmek gerçekten çok güzel bir deneyim. Hem kaliteli servis hem de keyifli atmosfer arayanlar için My Friends Pub kesinlikle tavsiye edilir. Tekrar gelmek isteyeceğiniz bir yer. 🍻',
    link: 'https://maps.app.goo.gl/xT67xJJWYfTMrnah8?g_st=ic'
  },
  {
    name: 'Irina Mokritsina',
    rating: 5,
    date: '28.05.2026',
    text: 'Andrey and Denis are very professional bartenders. We was happy to coming here. Already 2 years we are here and enjoying this place because od stuff. Thank u so much!!!!',
    link: 'https://maps.app.goo.gl/9c35QiyrWPT6Axvi8?g_st=ic'
  }
];
