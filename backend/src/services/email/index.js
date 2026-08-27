const ConsoleEmailService = require('./ConsoleEmailService');

// Фабрика почтового сервиса. Чтобы подключить Resend/SendGrid:
// 1. Создать ResendEmailService.js / SendGridEmailService.js, реализующий EmailService.
// 2. Добавить сюда ветку для этого значения EMAIL_PROVIDER.
// 3. Прописать EMAIL_PROVIDER=resend (или sendgrid) и API-ключ в .env.
function getEmailService() {
  const provider = process.env.EMAIL_PROVIDER || 'console';
  switch (provider) {
    case 'console':
      return new ConsoleEmailService();
    default:
      throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
  }
}

module.exports = { getEmailService };
