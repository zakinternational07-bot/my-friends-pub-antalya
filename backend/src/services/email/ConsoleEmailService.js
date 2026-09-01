const fs = require('fs');
const path = require('path');
const EmailService = require('./EmailService');

const emailsDir = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'emails')
  : path.join(__dirname, '..', '..', '..', 'data', 'emails');

// Тестовый провайдер писем: реальная почта никуда не уходит. Письмо
// логируется в консоль и сохраняется как .html файл в backend/data/emails/,
// чтобы можно было открыть его в браузере и увидеть, что получил бы гость.
// Заменить на Resend/SendGrid — см. README.
class ConsoleEmailService extends EmailService {
  async send({ to, subject, html }) {
    if (!fs.existsSync(emailsDir)) fs.mkdirSync(emailsDir, { recursive: true });
    const safeStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${safeStamp}-${to.replace(/[^a-z0-9@.]/gi, '_')}.html`;
    const filePath = path.join(emailsDir, fileName);
    fs.writeFileSync(filePath, html, 'utf8');

    console.log('----- [ConsoleEmailService] TEST-MODE EMAIL -----');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Saved to: ${filePath}`);
    console.log('--------------------------------------------------');

    return { success: true, savedTo: filePath };
  }
}

module.exports = ConsoleEmailService;
