const db = require('../db/connection');

function holdMinutes() {
  return Number(process.env.SEAT_HOLD_MINUTES || 10);
}

function computeHoldExpiryIso() {
  const d = new Date(Date.now() + holdMinutes() * 60 * 1000);
  return d.toISOString();
}

// Возвращает план зала с текущим статусом каждого места для события:
// 'free' | 'held' | 'taken' (taken = оплачено)
function getSeatStatuses(eventId) {
  const seats = db.prepare('SELECT * FROM hall_seats ORDER BY table_label, seat_number').all();
  const nowIso = new Date().toISOString();

  const occupied = db.prepare(`
    SELECT bs.seat_id as seat_id, b.status as status
    FROM booking_seats bs
    JOIN bookings b ON b.id = bs.booking_id
    WHERE bs.event_id = ?
      AND (b.status = 'paid' OR (b.status = 'held' AND b.hold_expires_at > ?))
  `).all(eventId, nowIso);

  const statusBySeat = new Map();
  occupied.forEach((row) => {
    statusBySeat.set(row.seat_id, row.status === 'paid' ? 'taken' : 'held');
  });

  return seats.map((seat) => ({
    ...seat,
    status: statusBySeat.get(seat.id) || 'free',
  }));
}

// Помечает просроченные held-брони как expired. Возвращает список
// затронутых event_id, чтобы вызывающий код разослал обновление по WS.
function expireStaleBookings() {
  const nowIso = new Date().toISOString();
  const stale = db.prepare(`
    SELECT DISTINCT bs.event_id as event_id, b.id as booking_id
    FROM bookings b
    JOIN booking_seats bs ON bs.booking_id = b.id
    WHERE b.status = 'held' AND b.hold_expires_at <= ?
  `).all(nowIso);

  if (stale.length === 0) return [];

  const update = db.prepare("UPDATE bookings SET status = 'expired' WHERE id = ?");
  const updateAll = db.transaction((rows) => {
    const seen = new Set();
    rows.forEach((r) => {
      if (!seen.has(r.booking_id)) {
        update.run(r.booking_id);
        seen.add(r.booking_id);
      }
    });
  });
  updateAll(stale);

  return [...new Set(stale.map((r) => r.event_id))];
}

module.exports = { holdMinutes, computeHoldExpiryIso, getSeatStatuses, expireStaleBookings };
