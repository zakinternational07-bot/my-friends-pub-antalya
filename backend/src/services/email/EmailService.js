// Базовый интерфейс сервиса отправки писем. Реальная интеграция (Resend,
// SendGrid, ...) реализует send() и подключается через email/index.js по
// значению EMAIL_PROVIDER в .env.
class EmailService {
  // eslint-disable-next-line no-unused-vars
  async send({ to, subject, html }) {
    throw new Error('send() not implemented');
  }
}

module.exports = EmailService;
