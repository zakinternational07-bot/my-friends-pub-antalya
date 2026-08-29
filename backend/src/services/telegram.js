// Тонкая обёртка над Telegram Bot API. Токен/юзернейм бота — из .env
// (TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME). Если не настроены —
// функции просто логируют и ничего не делают, чтобы локальная разработка
// без бота не ломалась.

function isConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

function apiUrl(method) {
  return `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
}

async function callApi(method, payload) {
  if (!isConfigured()) {
    console.log(`[telegram] TELEGRAM_BOT_TOKEN не задан, пропускаю ${method}:`, payload);
    return null;
  }
  try {
    const res = await fetch(apiUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) console.error(`[telegram] ${method} failed:`, data.description);
    return data;
  } catch (err) {
    console.error(`[telegram] ${method} error:`, err.message);
    return null;
  }
}

function sendMessage(chatId, text, replyMarkup) {
  return callApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

// Кнопки-ссылки (не callback) — открывают URL в браузере, без вебхука на нажатие.
function urlButtonsRow(buttons) {
  return { inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))] };
}

function botDeepLink(token) {
  const username = process.env.TELEGRAM_BOT_USERNAME;
  if (!username) return null;
  return `https://t.me/${username}?start=${token}`;
}

async function registerWebhook(publicBaseUrl) {
  if (!isConfigured() || !publicBaseUrl) return;
  const url = `${publicBaseUrl.replace(/\/$/, '')}/api/telegram/webhook`;
  const result = await callApi('setWebhook', { url });
  if (result && result.ok) console.log(`[telegram] webhook зарегистрирован: ${url}`);
}

module.exports = { isConfigured, sendMessage, urlButtonsRow, botDeepLink, registerWebhook };
