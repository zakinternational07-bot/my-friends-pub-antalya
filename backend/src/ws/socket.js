const { WebSocketServer } = require('ws');
const { getSeatStatuses, expireStaleBookings } = require('../services/seatHold');

let wss = null;

function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.eventId = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe' && msg.eventId) {
          ws.eventId = Number(msg.eventId);
          ws.send(JSON.stringify({
            type: 'seat_update',
            eventId: ws.eventId,
            seats: getSeatStatuses(ws.eventId),
          }));
        }
      } catch (err) {
        // ignore malformed client messages
      }
    });
  });

  // Периодически освобождаем просроченные брони и уведомляем подписчиков.
  setInterval(() => {
    const affectedEventIds = expireStaleBookings();
    affectedEventIds.forEach((eventId) => broadcastSeatUpdate(eventId));
  }, 30 * 1000);

  return wss;
}

function broadcastSeatUpdate(eventId) {
  if (!wss) return;
  const seats = getSeatStatuses(eventId);
  const payload = JSON.stringify({ type: 'seat_update', eventId, seats });
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.eventId === Number(eventId)) {
      client.send(payload);
    }
  });
}

module.exports = { initWebSocket, broadcastSeatUpdate };
