const express = require('express');
const db = require('../db/connection');
const { getPaymentProvider } = require('../services/payment');
const { getEmailService } = require('../services/email');
const { generateQrDataUrl, ticketEmailHtml } = require('../services/ticket');
const { broadcastSeatUpdate } = require('../ws/socket');

const router = express.Router();

router.post('/mock/confirm', async (req, res) => {
  const { bookingRef } = req.body || {};
  if (!bookingRef) return res.status(400).json({ error: 'bookingRef обязателен' });

  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref = ?').get(bookingRef);
  if (!booking) return res.status(404).json({ error: 'Бронь не найдена' });
  if (booking.status === 'paid') return res.json({ success: true, alreadyPaid: true });
  if (booking.status !== 'held') {
    return res.status(409).json({ error: 'Бронь просрочена или отменена, начните заново' });
  }
  if (new Date(booking.hold_expires_at) < new Date()) {
    db.prepare("UPDATE bookings SET status = 'expired' WHERE id = ?").run(booking.id);
    broadcastSeatUpdate(booking.event_id);
    return res.status(409).json({ error: 'Время брони истекло, начните заново' });
  }

  const provider = getPaymentProvider();
  const result = await provider.confirmPayment(bookingRef);
  if (!result.success) {
    return res.status(402).json({ error: 'Оплата не прошла' });
  }

  db.prepare("UPDATE bookings SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(booking.id);

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(booking.event_id);
  const seats = db.prepare(`
    SELECT hs.table_label, hs.seat_number
    FROM booking_seats bs JOIN hall_seats hs ON hs.id = bs.seat_id
    WHERE bs.booking_id = ?
  `).all(booking.id);
  const seatLabels = seats.map((s) => `${s.table_label} место ${s.seat_number}`);

  const qrDataUrl = await generateQrDataUrl(booking.booking_ref);
  const html = ticketEmailHtml({ booking, event, seatLabels, qrDataUrl });

  const emailService = getEmailService();
  await emailService.send({
    to: booking.customer_email,
    subject: `Ваш билет на "${event.title}" — My Friends Pub Antalya`,
    html,
  });

  broadcastSeatUpdate(booking.event_id);

  res.json({ success: true, bookingRef, qrDataUrl });
});

// Для payment-success.html: отдаёт QR повторно (например, после обновления
// страницы), не отправляя письмо ещё раз.
router.get('/ticket/:ref', async (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE booking_ref = ?').get(req.params.ref);
  if (!booking || booking.status !== 'paid') {
    return res.status(404).json({ error: 'Оплаченная бронь не найдена' });
  }
  const qrDataUrl = await generateQrDataUrl(booking.booking_ref);
  res.json({ bookingRef: booking.booking_ref, qrDataUrl });
});

module.exports = router;
