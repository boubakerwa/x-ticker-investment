import { createNotificationEvent, listNotificationEvents, markNotificationDelivered, markNotificationFailed } from "./notificationStore.js";

const DEFAULT_TELEGRAM_API_BASE = "https://api.telegram.org";

function normalizeProvider(value) {
  return value === "telegram" ? value : "disabled";
}

export function getNotificationConfig() {
  const provider = normalizeProvider((process.env.NOTIFICATION_PROVIDER || "disabled").toLowerCase());
  const enabled = process.env.NOTIFICATIONS_ENABLED === "1" || provider === "telegram";
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const telegramChatId = process.env.TELEGRAM_CHAT_ID || "";
  const telegramApiBaseUrl = (process.env.TELEGRAM_API_BASE_URL || DEFAULT_TELEGRAM_API_BASE).replace(/\/+$/, "");
  const hasTelegramCredentials = Boolean(telegramBotToken && telegramChatId);
  const activeProvider = enabled && provider === "telegram" && hasTelegramCredentials ? "telegram" : "disabled";

  return {
    enabled,
    requestedProvider: provider,
    activeProvider,
    telegramApiBaseUrl,
    telegramBotToken,
    telegramChatId,
    hasTelegramCredentials
  };
}

export function getSafeNotificationConfig() {
  const config = getNotificationConfig();

  return {
    enabled: config.enabled,
    requestedProvider: config.requestedProvider,
    activeProvider: config.activeProvider,
    hasTelegramCredentials: config.hasTelegramCredentials,
    telegramChatIdConfigured: Boolean(config.telegramChatId),
    telegramApiBaseUrl: config.telegramApiBaseUrl
  };
}

export function escapeTelegram(value) {
  return String(value).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

export function formatTelegramMessage(message) {
  const lines = [];

  if (message.title) {
    lines.push(`*${escapeTelegram(message.title)}*`);
  }

  if (message.summary) {
    lines.push(escapeTelegram(message.summary));
  }

  for (const item of message.facts || []) {
    lines.push(`• *${escapeTelegram(item.label)}*: ${escapeTelegram(item.value)}`);
  }

  if (Array.isArray(message.highlights) && message.highlights.length) {
    lines.push("");

    for (const item of message.highlights) {
      lines.push(`• ${escapeTelegram(item)}`);
    }
  }

  if (message.footer) {
    lines.push("");
    lines.push(escapeTelegram(message.footer));
  }

  return lines.join("\n");
}

export async function callTelegramApi(method, payload, config = getNotificationConfig()) {
  if (!config.telegramBotToken) {
    throw new Error("Telegram bot token is not configured.");
  }

  const response = await fetch(
    `${config.telegramApiBaseUrl}/bot${config.telegramBotToken}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(payload)
    }
  );

  const responsePayload = await response.json().catch(() => ({}));

  if (!response.ok || responsePayload.ok === false) {
    throw new Error(responsePayload.description || `Telegram request failed with status ${response.status}.`);
  }

  return responsePayload;
}

export async function sendTelegramTextMessage({
  chatId,
  message,
  config = getNotificationConfig(),
  disableWebPreview = true
} = {}) {
  const resolvedChatId = String(chatId || config.telegramChatId || "").trim();

  if (!resolvedChatId) {
    throw new Error("Telegram chat id is not configured.");
  }

  return callTelegramApi(
    "sendMessage",
    {
      chat_id: resolvedChatId,
      text: typeof message === "string" ? message : formatTelegramMessage(message),
      parse_mode: "MarkdownV2",
      disable_web_page_preview: disableWebPreview
    },
    config
  );
}

export async function sendNotification({ eventType, message, payload = {} }) {
  const config = getNotificationConfig();
  const event = createNotificationEvent({
    channel: config.activeProvider,
    eventType,
    payload
  });

  if (config.activeProvider === "disabled") {
    return markNotificationDelivered(event.id, {
      status: "skipped",
      sentAt: new Date().toISOString(),
      payload: {
        ...event.payload,
        skipped: true,
        reason: "Notifications are disabled or provider credentials are missing.",
        message
      }
    });
  }

  try {
    const providerResponse = await sendTelegramTextMessage({
      message,
      config
    });
    return markNotificationDelivered(event.id, {
      payload: {
        ...event.payload,
        providerResponse,
        message
      }
    });
  } catch (error) {
    return markNotificationFailed(event.id, error, {
      payload: {
        ...event.payload,
        message
      }
    });
  }
}

export function getNotificationStatus() {
  const config = getSafeNotificationConfig();
  const recentEvents = listNotificationEvents(10);

  return {
    config,
    recentEvents,
    lastEvent: recentEvents[0] || null
  };
}
