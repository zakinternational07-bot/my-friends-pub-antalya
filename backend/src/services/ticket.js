const crypto = require('crypto');
const QRCode = require('qrcode');

function generateBookingRef() {
  // Короткий человекочитаемый номер брони, например MFP-7K3F9A
  const random = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `MFP-${random}`;
}

async function generateQrDataUrl(bookingRef) {
  return QRCode.toDataURL(bookingRef, { margin: 1, width: 240 });
}

function ticketEmailHtml({ booking, event, seatLabels, qrDataUrl }) {
  return `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><title>Билет My Friends Pub Antalya</title></head>
<body style="margin:0;padding:24px;background:#1a1a1a;color:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#242424;border:1px solid #3a3a3a;border-radius:8px;overflow:hidden;">
    <div style="background:#c0272d;padding:16px 24px;">
      <h1 style="margin:0;font-size:20px;letter-spacing:1px;">MY FRIENDS PUB ANTALYA</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 8px;font-size:14px;color:#bbb;">Ваш билет подтверждён (тестовый режим)</p>
      <h2 style="margin:0 0 16px;font-size:22px;">${event.title}</h2>
      <p style="margin:4px 0;">Дата: <strong>${event.event_date} ${event.event_time}</strong></p>
      <p style="margin:4px 0;">Места: <strong>${seatLabels.join(', ')}</strong></p>
      <p style="margin:4px 0;">Гость: <strong>${booking.customer_name}</strong></p>
      <p style="margin:4px 0 16px;">Сумма: <strong>${booking.total_price} ₺</strong></p>
      <p style="margin:0 0 8px;">Номер брони: <strong>${booking.booking_ref}</strong></p>
      <img src="${qrDataUrl}" alt="QR код брони" width="180" height="180" style="display:block;margin:16px 0;border-radius:4px;" />
      <p style="font-size:12px;color:#888;">Покажите этот QR-код на входе. Это письмо сгенерировано в тестовом режиме — реальная оплата не производилась.</p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { generateBookingRef, generateQrDataUrl, ticketEmailHtml };
