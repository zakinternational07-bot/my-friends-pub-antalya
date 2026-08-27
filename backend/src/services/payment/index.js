const MockPaymentProvider = require('./MockPaymentProvider');

// Фабрика провайдера оплаты. Чтобы подключить iyzico/PayTR:
// 1. Создать IyzicoProvider.js / PayTRProvider.js, реализующий PaymentProvider.
// 2. Добавить сюда ветку для этого значения PAYMENT_PROVIDER.
// 3. Прописать PAYMENT_PROVIDER=iyzico (или paytr) и нужные API-ключи в .env.
function getPaymentProvider() {
  const provider = process.env.PAYMENT_PROVIDER || 'mock';
  switch (provider) {
    case 'mock':
      return new MockPaymentProvider();
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER: ${provider}`);
  }
}

module.exports = { getPaymentProvider };
