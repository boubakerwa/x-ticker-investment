const PAPER_TRADE_PRICE_PROVIDER_VERSION = {
  none: "paper-trade-price-none-v1",
  twelveData: "twelve-data-price-v1"
};

const TWELVE_DATA_API_BASE_URL = "https://api.twelvedata.com";
const PAPER_TRADE_PRICE_CACHE_TTL_MS = Number(process.env.PAPER_TRADE_PRICE_CACHE_TTL_MS || 20_000);
const PAPER_TRADE_PRICE_TIMEOUT_MS = Number(process.env.PAPER_TRADE_PRICE_TIMEOUT_MS || 6_000);

const twelveDataSymbolMap = {
  BTC: "BTC/USD"
};

const priceCache = new Map();

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9./-]/g, "");
}

function normalizeProvider(value) {
  const normalizedValue = String(value || "auto").trim().toLowerCase();

  if (normalizedValue === "none" || normalizedValue === "twelve-data") {
    return normalizedValue;
  }

  return "auto";
}

function normalizeString(value, fallbackValue = "") {
  return String(value ?? fallbackValue).trim();
}

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function getTwelveDataApiKey() {
  return normalizeString(process.env.TWELVE_DATA_API_KEY || "");
}

export function getPaperTradePriceProviderConfig() {
  const requestedProvider = normalizeProvider(process.env.PAPER_TRADE_PRICE_PROVIDER || "auto");
  const apiKey = getTwelveDataApiKey();

  return {
    requestedProvider,
    timeoutMs: PAPER_TRADE_PRICE_TIMEOUT_MS,
    cacheTtlMs: PAPER_TRADE_PRICE_CACHE_TTL_MS,
    twelveDataConfigured: Boolean(apiKey)
  };
}

function buildUnavailableSnapshot(config, reason, { configured = false } = {}) {
  return {
    requestedProvider: config.requestedProvider,
    activeProvider: "none",
    providerVersion: PAPER_TRADE_PRICE_PROVIDER_VERSION.none,
    configured,
    generatedAt: new Date().toISOString(),
    warnings: reason ? [reason] : [],
    note: reason,
    summary: {
      requestedCount: 0,
      coveredCount: 0
    },
    assets: [],
    byTicker: {}
  };
}

function mapTickerToTwelveDataSymbol(ticker) {
  return twelveDataSymbolMap[normalizeTicker(ticker)] || normalizeTicker(ticker);
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload) {
      throw new Error(`Price request failed with ${response.status}.`);
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTwelveDataPriceForTicker(ticker, config) {
  const cleanTicker = normalizeTicker(ticker);
  const cachedEntry = priceCache.get(cleanTicker);

  if (cachedEntry && Date.now() - cachedEntry.loadedAt < config.cacheTtlMs) {
    return cachedEntry.value;
  }

  const symbol = mapTickerToTwelveDataSymbol(cleanTicker);
  const apiKey = getTwelveDataApiKey();
  const url = new URL(`${TWELVE_DATA_API_BASE_URL}/price`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);

  const payload = await fetchJson(url.toString(), config.timeoutMs);

  if (payload?.status === "error") {
    throw new Error(
      normalizeString(payload.message, `Twelve Data rejected ${cleanTicker}.`)
    );
  }

  const lastPrice = Number(payload?.price);

  if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
    throw new Error(`No usable price was returned for ${cleanTicker}.`);
  }

  const quote = {
    ticker: cleanTicker,
    providerVersion: PAPER_TRADE_PRICE_PROVIDER_VERSION.twelveData,
    generatedAt: new Date().toISOString(),
    lastPrice: round(lastPrice),
    source: "twelve-data",
    sourceSymbol: symbol
  };

  priceCache.set(cleanTicker, {
    loadedAt: Date.now(),
    value: quote
  });

  return quote;
}

export async function getPaperTradePriceSnapshot({ tickers = [] } = {}) {
  const config = getPaperTradePriceProviderConfig();
  const requestedTickers = [...new Set((tickers || []).map((ticker) => normalizeTicker(ticker)).filter(Boolean))];

  if (config.requestedProvider === "none") {
    return buildUnavailableSnapshot(config, "Automatic paper-trade marks are disabled.");
  }

  if (!config.twelveDataConfigured) {
    return buildUnavailableSnapshot(config, "Set TWELVE_DATA_API_KEY to enable automatic paper-trade marks.", {
      configured: false
    });
  }

  if (!requestedTickers.length) {
    return {
      requestedProvider: config.requestedProvider,
      activeProvider: "twelve-data",
      providerVersion: PAPER_TRADE_PRICE_PROVIDER_VERSION.twelveData,
      configured: true,
      generatedAt: new Date().toISOString(),
      warnings: [],
      note: "Twelve Data is configured and ready for paper-trade mark prices.",
      summary: {
        requestedCount: 0,
        coveredCount: 0
      },
      assets: [],
      byTicker: {}
    };
  }

  const results = await Promise.allSettled(
    requestedTickers.map((ticker) => fetchTwelveDataPriceForTicker(ticker, config))
  );
  const quotes = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const warnings = results
    .map((result, index) =>
      result.status === "rejected"
        ? `${requestedTickers[index]}: ${String(result.reason?.message || result.reason || "price lookup failed")}`
        : ""
    )
    .filter(Boolean);
  const byTicker = Object.fromEntries(quotes.map((quote) => [quote.ticker, quote]));

  return {
    requestedProvider: config.requestedProvider,
    activeProvider: quotes.length ? "twelve-data" : "none",
    providerVersion: quotes.length
      ? PAPER_TRADE_PRICE_PROVIDER_VERSION.twelveData
      : PAPER_TRADE_PRICE_PROVIDER_VERSION.none,
    configured: true,
    generatedAt: new Date().toISOString(),
    warnings,
    note: quotes.length
      ? "Automatic mark prices are coming from Twelve Data when available."
      : "Twelve Data is configured, but no usable mark prices were returned for the requested symbols.",
    summary: {
      requestedCount: requestedTickers.length,
      coveredCount: quotes.length
    },
    assets: quotes,
    byTicker
  };
}
