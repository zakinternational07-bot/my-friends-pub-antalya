require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');

const runSeed = require('./src/db/seed');
const eventsRouter = require('./src/routes/events');
const menuRouter = require('./src/routes/menu');
const bookingsRouter = require('./src/routes/bookings');
const authRouter = require('./src/routes/auth');
const adminRouter = require('./src/routes/admin');
const telegramWebhookRouter = require('./src/routes/telegramWebhook');
const rsvpRouter = require('./src/routes/rsvp');
const surveyRouter = require('./src/routes/survey');
const waitlistRouter = require('./src/routes/waitlist');
const waitlistLeaveRouter = require('./src/routes/waitlistLeave');
const arrivalRouter = require('./src/routes/arrival');
const { uploadsDir } = require('./src/middleware/upload');
const { initWebSocket } = require('./src/ws/socket');
const telegram = require('./src/services/telegram');
const { startReminderScheduler } = require('./src/services/reminderScheduler');
const { startSurveyScheduler } = require('./src/services/surveyScheduler');

// Создаёт/обновляет админ-аккаунт и сидирует данные, если БД пустая.
runSeed();

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 часов
}));

app.use('/api/events', eventsRouter);
app.use('/api/menu', menuRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/telegram', telegramWebhookRouter);
app.use('/rsvp', rsvpRouter);
app.use('/survey', surveyRouter);
app.use('/api/waitlist', waitlistRouter);
app.use('/waitlist', waitlistLeaveRouter);
app.use('/arrival', arrivalRouter);

const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));
// Фото/видео, загруженные через админку (см. src/middleware/upload.js) —
// живут на постоянном диске, а не в frontend/, поэтому отдельный роут.
app.use('/uploads', express.static(uploadsDir));

app.get('/', (req, res) => {
  res.redirect('/html/index.html');
});

initWebSocket(server);
startReminderScheduler();
startSurveyScheduler();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`My Friends Pub Antalya backend running on http://localhost:${PORT}`);
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL;
  if (telegram.isConfigured() && publicBaseUrl) {
    telegram.registerWebhook(publicBaseUrl);
  }
});
