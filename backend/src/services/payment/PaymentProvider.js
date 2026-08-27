// Базовый интерфейс платёжного провайдера. Любая реальная интеграция
// (iyzico, PayTR, ...) должна реализовать эти же методы и подключаться
// через services/payment/index.js по значению PAYMENT_PROVIDER в .env —
// остальной код (routes/payments.js, бронирование) провайдера не касается.
class PaymentProvider {
  // Возвращает { redirectUrl } — куда отправить гостя для оплаты.
  // eslint-disable-next-line no-unused-vars
  async createPayment(booking) {
    throw new Error('createPayment() not implemented');
  }

  // Подтверждает оплату по booking_ref. Возвращает { success: boolean }.
  // eslint-disable-next-line no-unused-vars
  async confirmPayment(bookingRef) {
    throw new Error('confirmPayment() not implemented');
  }
}

module.exports = PaymentProvider;
