const crypto = require('crypto');

function generateBookingRef() {
  // Короткий человекочитаемый номер брони, например MFP-7K3F9A
  const random = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `MFP-${random}`;
}

module.exports = { generateBookingRef };
