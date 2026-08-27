require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');

const runSeed = require('./src/db/seed');
const eventsRouter = require('./src/routes/events');
const menuRouter = require('./src/routes/menu');
const bookingsRouter = require('./src/routes/bookings');
const paymentsRouter = require('./src/routes/payments');
const authRouter = require('./src/routes/auth');
const adminRouter = require('./src/routes/admin');
const { initWebSocket } = require('./src/ws/socket');

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
app.use('/api/payments', paymentsRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

app.get('/', (req, res) => {
  res.redirect('/html/index.html');
});

initWebSocket(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`My Friends Pub Antalya backend running on http://localhost:${PORT}`);
  console.log('Тестовый режим: оплата и письма не настоящие (см. README).');
});
