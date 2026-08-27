const PaymentProvider = require('./PaymentProvider');

// Тестовый провайдер: не проводит реальные деньги. Имитирует переход на
// страницу оплаты и мгновенное подтверждение по нажатию кнопки на
// frontend/html/payment.html. Заменить на реальный шлюз — см. README.
class MockPaymentProvider extends PaymentProvider {
  async createPayment(booking) {
    return { redirectUrl: `/html/payment.html?booking=${booking.booking_ref}` };
  }

  async confirmPayment(_bookingRef) {
    return { success: true };
  }
}

module.exports = MockPaymentProvider;
