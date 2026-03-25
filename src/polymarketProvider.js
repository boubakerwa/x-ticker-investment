import { ClobClient, OrderType, Side } from "@polymarket/clob-client";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { polygon, polygonAmoy } from "viem/chains";

const DEFAULT_GAMMA_API_BASE_URL = "https://gamma-api.polymarket.com";
const DEFAULT_CLOB_API_BASE_URL = "https://clob.polymarket.com";
const DEFAULT_SITE_BASE_URL = "https://polymarket.com";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MARKET_LIMIT = 24;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function normalizeBaseUrl(value, fallback) {
  return String(value || fallback).trim().replace(/\/+$/, "");
}

function normalizePositiveInteger(value, fallback) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return Math.max(1, Math.round(numericValue));
}

function normalizeSignatureType(value) {
  const numericValue = Number(value);
  return numericValue === 1 || numericValue === 2 ? numericValue : 0;
}

function normalizePrivateKey(value) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  return trimmedValue.startsWith("0x") ? trimmedValue : `0x${trimmedValue}`;
}

function normalizeBooleanFlag(value, fallback = false) {
  if (value == null || value === "") {
    return fallback;
  }

  const normalizedValue = String(value).trim().toLowerCase();
  return normalizedValue === "1" || normalizedValue === "true" || normalizedValue === "yes";
}

function normalizeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function parseJsonArrayField(value) {
  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsedValue = JSON.parse(String(value || "[]"));
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (_error) {
    return [];
  }
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeOutcomeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeTickSize(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "0.01";
  }

  if (numericValue <= 0.0001) {
    return "0.0001";
  }

  if (numericValue <= 0.001) {
    return "0.001";
  }

  if (numericValue <= 0.01) {
    return "0.01";
  }

  return "0.1";
}

function buildStatusError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function fetchJson(url, { method = "GET", headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw buildStatusError(
        payload?.error || payload?.message || `Polymarket request failed with status ${response.status}.`,
        response.status
      );
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function getChainDefinition(chainId) {
  return chainId === 80002 ? polygonAmoy : polygon;
}

function computeDisplayProbability({
  bestBid,
  bestAsk,
  lastTradePrice,
  fallbackProbability,
  spread
}) {
  const midpoint =
    Number.isFinite(bestBid) && Number.isFinite(bestAsk) ? round((bestBid + bestAsk) / 2, 4) : null;

  if (midpoint != null && Number.isFinite(spread) && spread <= 0.1) {
    return {
      probability: midpoint,
      source: "midpoint"
    };
  }

  if (Number.isFinite(lastTradePrice)) {
    return {
      probability: round(lastTradePrice, 4),
      source: "last-trade"
    };
  }

  return {
    probability: round(fallbackProbability ?? 0, 4),
    source: "outcome-price"
  };
}

function normalizeRawMarket(rawMarket) {
  const outcomes = parseJsonArrayField(rawMarket?.outcomes);
  const outcomePrices = parseJsonArrayField(rawMarket?.outcomePrices).map((value) =>
    clamp(Number(value || 0), 0, 1)
  );
  const clobTokenIds = parseJsonArrayField(rawMarket?.clobTokenIds);
  const bestBid = normalizeNumber(rawMarket?.bestBid);
  const bestAsk = normalizeNumber(rawMarket?.bestAsk);
  const lastTradePrice = normalizeNumber(rawMarket?.lastTradePrice);
  const spread = normalizeNumber(rawMarket?.spread);
  const primaryOutcomePrice = outcomePrices[0] ?? lastTradePrice ?? 0;
  const displayProbability = computeDisplayProbability({
    bestBid,
    bestAsk,
    lastTradePrice,
    fallbackProbability: primaryOutcomePrice,
    spread
  });
  const primaryEvent = Array.isArray(rawMarket?.events) ? rawMarket.events[0] || null : null;

  return {
    id: String(rawMarket?.id || ""),
    slug: String(rawMarket?.slug || ""),
    question: String(rawMarket?.question || ""),
    description: String(rawMarket?.description || ""),
    eventTitle: String(primaryEvent?.title || rawMarket?.groupItemTitle || rawMarket?.question || ""),
    eventSlug: String(primaryEvent?.slug || rawMarket?.slug || ""),
    eventContext: String(primaryEvent?.eventMetadata?.context_description || ""),
    image: String(rawMarket?.image || rawMarket?.icon || ""),
    active: Boolean(rawMarket?.active),
    closed: Boolean(rawMarket?.closed),
    acceptingOrders: Boolean(rawMarket?.acceptingOrders),
    restricted: Boolean(rawMarket?.restricted),
    endDate: String(rawMarket?.endDate || ""),
    startDate: String(rawMarket?.startDate || ""),
    updatedAt: String(rawMarket?.updatedAt || ""),
    liquidity: normalizeNumber(rawMarket?.liquidityNum ?? rawMarket?.liquidity) || 0,
    volume24hr: normalizeNumber(rawMarket?.volume24hr) || 0,
    volume: normalizeNumber(rawMarket?.volumeNum ?? rawMarket?.volume) || 0,
    bestBid,
    bestAsk,
    spread,
    lastTradePrice,
    displayProbability: displayProbability.probability,
    displayPriceSource: displayProbability.source,
    feesEnabled: Boolean(rawMarket?.feesEnabled),
    feeType: rawMarket?.feeType || "",
    orderMinSize: normalizeNumber(rawMarket?.orderMinSize) || 0,
    orderPriceMinTickSize: normalizeNumber(rawMarket?.orderPriceMinTickSize) || 0.01,
    negRisk: Boolean(rawMarket?.negRisk),
    url: rawMarket?.slug ? `${getPolymarketConfig().siteBaseUrl}/event/${rawMarket.slug}` : "",
    outcomes: outcomes.map((name, index) => ({
      index,
      name: String(name || `Outcome ${index + 1}`),
      tokenId: String(clobTokenIds[index] || ""),
      price: round(outcomePrices[index] ?? 0, 4)
    }))
  };
}

function sortMarkets(markets = []) {
  return [...markets].sort((left, right) => {
    const volumeDifference = (right.volume24hr || 0) - (left.volume24hr || 0);

    if (volumeDifference !== 0) {
      return volumeDifference;
    }

    const liquidityDifference = (right.liquidity || 0) - (left.liquidity || 0);

    if (liquidityDifference !== 0) {
      return liquidityDifference;
    }

    return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
  });
}

function filterMarketsBySearch(markets, search) {
  const searchValue = normalizeText(search).toLowerCase();

  if (!searchValue) {
    return markets;
  }

  return markets.filter((market) =>
    [
      market.question,
      market.description,
      market.eventTitle,
      market.eventContext,
      market.slug
    ]
      .join(" ")
      .toLowerCase()
      .includes(searchValue)
  );
}

function getConfiguredFunderAddress(config, accountAddress) {
  return config.signatureType === 0 ? accountAddress : String(config.funderAddress || "").trim();
}

async function createAuthenticatedClient() {
  const config = getPolymarketConfig();

  if (!config.privateKey) {
    throw buildStatusError("POLYMARKET_PRIVATE_KEY is not configured.", 400);
  }

  const account = privateKeyToAccount(config.privateKey);
  const funderAddress = getConfiguredFunderAddress(config, account.address);

  if (!funderAddress) {
    throw buildStatusError(
      "POLYMARKET_FUNDER_ADDRESS is required for non-EOA Polymarket signing modes.",
      400
    );
  }

  const signer = createWalletClient({
    account,
    chain: getChainDefinition(config.chainId),
    transport: http()
  });
  const existingCreds =
    config.apiKey && config.apiSecret && config.apiPassphrase
      ? {
          key: config.apiKey,
          secret: config.apiSecret,
          passphrase: config.apiPassphrase
        }
      : null;

  if (existingCreds) {
    return {
      client: new ClobClient(
        config.clobApiBaseUrl,
        config.chainId,
        signer,
        existingCreds,
        config.signatureType,
        funderAddress,
        undefined,
        true
      ),
      account,
      creds: existingCreds,
      funderAddress
    };
  }

  const bootstrapClient = new ClobClient(
    config.clobApiBaseUrl,
    config.chainId,
    signer,
    undefined,
    config.signatureType,
    funderAddress,
    undefined,
    true
  );
  const creds = await bootstrapClient.createOrDeriveApiKey();

  return {
    client: new ClobClient(
      config.clobApiBaseUrl,
      config.chainId,
      signer,
      creds,
      config.signatureType,
      funderAddress,
      undefined,
      true
    ),
    account,
    creds,
    funderAddress
  };
}

export function getPolymarketConfig() {
  const chainId = normalizePositiveInteger(process.env.POLYMARKET_CHAIN_ID || 137, 137);
  const privateKey = normalizePrivateKey(process.env.POLYMARKET_PRIVATE_KEY || "");
  const signatureType = normalizeSignatureType(process.env.POLYMARKET_SIGNATURE_TYPE || 0);
  const funderAddress = normalizeText(process.env.POLYMARKET_FUNDER_ADDRESS || "");
  const apiKey = normalizeText(process.env.POLYMARKET_API_KEY || "");
  const apiSecret = normalizeText(process.env.POLYMARKET_API_SECRET || "");
  const apiPassphrase = normalizeText(process.env.POLYMARKET_API_PASSPHRASE || "");
  const tradingConfigured = Boolean(
    privateKey && (signatureType === 0 || funderAddress)
  );

  return {
    gammaApiBaseUrl: normalizeBaseUrl(
      process.env.POLYMARKET_GAMMA_API_BASE_URL,
      DEFAULT_GAMMA_API_BASE_URL
    ),
    clobApiBaseUrl: normalizeBaseUrl(
      process.env.POLYMARKET_CLOB_API_BASE_URL,
      DEFAULT_CLOB_API_BASE_URL
    ),
    siteBaseUrl: normalizeBaseUrl(process.env.POLYMARKET_SITE_BASE_URL, DEFAULT_SITE_BASE_URL),
    timeoutMs: normalizePositiveInteger(
      process.env.POLYMARKET_API_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS
    ),
    defaultMarketLimit: normalizePositiveInteger(
      process.env.POLYMARKET_DEFAULT_MARKETS_LIMIT,
      DEFAULT_MARKET_LIMIT
    ),
    defaultActiveOnly: normalizeBooleanFlag(process.env.POLYMARKET_DEFAULT_ACTIVE_ONLY, true),
    chainId,
    signatureType,
    signatureLabel:
      signatureType === 1 ? "proxy" : signatureType === 2 ? "gnosis-safe" : "eoa",
    funderAddress,
    privateKey,
    privateKeyConfigured: Boolean(privateKey),
    funderAddressConfigured: Boolean(funderAddress),
    apiKey,
    apiSecret,
    apiPassphrase,
    apiCredsConfigured: Boolean(apiKey && apiSecret && apiPassphrase),
    tradingConfigured
  };
}

export function getSafePolymarketConfig() {
  const config = getPolymarketConfig();

  return {
    gammaApiBaseUrl: config.gammaApiBaseUrl,
    clobApiBaseUrl: config.clobApiBaseUrl,
    siteBaseUrl: config.siteBaseUrl,
    timeoutMs: config.timeoutMs,
    defaultMarketLimit: config.defaultMarketLimit,
    defaultActiveOnly: config.defaultActiveOnly,
    chainId: config.chainId,
    signatureType: config.signatureType,
    signatureLabel: config.signatureLabel,
    privateKeyConfigured: config.privateKeyConfigured,
    funderAddressConfigured: config.funderAddressConfigured,
    apiCredsConfigured: config.apiCredsConfigured,
    tradingConfigured: config.tradingConfigured
  };
}

export async function checkPolymarketGeoblock() {
  const config = getPolymarketConfig();

  const payload = await fetchJson(`${config.siteBaseUrl}/api/geoblock`, {
    timeoutMs: config.timeoutMs
  });

  return {
    blocked: Boolean(payload?.blocked),
    ip: String(payload?.ip || ""),
    country: String(payload?.country || ""),
    region: String(payload?.region || ""),
    checkedAt: new Date().toISOString()
  };
}

export async function getPolymarketFeeRateBps(tokenId) {
  const cleanTokenId = normalizeText(tokenId);

  if (!cleanTokenId) {
    return 0;
  }

  const config = getPolymarketConfig();
  const payload = await fetchJson(
    `${config.clobApiBaseUrl}/fee-rate?token_id=${encodeURIComponent(cleanTokenId)}`,
    {
      timeoutMs: config.timeoutMs
    }
  );

  return Number(payload?.base_fee || payload?.fee_rate_bps || 0) || 0;
}

export async function listPolymarketMarkets({
  search = "",
  limit = getPolymarketConfig().defaultMarketLimit,
  active = getPolymarketConfig().defaultActiveOnly,
  closed = false
} = {}) {
  const config = getPolymarketConfig();
  const fetchLimit = Math.max(limit, search ? Math.max(60, limit * 4) : limit);
  const url = new URL(`${config.gammaApiBaseUrl}/markets`);

  url.searchParams.set("limit", String(fetchLimit));
  url.searchParams.set("active", active ? "true" : "false");
  url.searchParams.set("closed", closed ? "true" : "false");

  const payload = await fetchJson(url.toString(), {
    timeoutMs: config.timeoutMs
  });
  const markets = filterMarketsBySearch(
    sortMarkets((Array.isArray(payload) ? payload : []).map((market) => normalizeRawMarket(market))),
    search
  ).slice(0, limit);

  return {
    search: normalizeText(search),
    limit,
    active,
    closed,
    markets
  };
}

export async function getPolymarketMarket(identifier) {
  const cleanIdentifier = normalizeText(identifier);

  if (!cleanIdentifier) {
    throw buildStatusError("A Polymarket market id or slug is required.", 400);
  }

  const config = getPolymarketConfig();
  const looksLikeNumericId = /^\d+$/.test(cleanIdentifier);
  const path = looksLikeNumericId
    ? `/markets/${encodeURIComponent(cleanIdentifier)}`
    : `/markets/slug/${encodeURIComponent(cleanIdentifier)}`;
  const payload = await fetchJson(`${config.gammaApiBaseUrl}${path}`, {
    timeoutMs: config.timeoutMs
  });

  return normalizeRawMarket(payload);
}

export function resolvePolymarketOutcome(market, requestedOutcome = "") {
  const outcomes = Array.isArray(market?.outcomes) ? market.outcomes : [];
  const requestedKey = normalizeOutcomeKey(requestedOutcome);

  if (requestedKey) {
    const matchingOutcome =
      outcomes.find((outcome) => normalizeOutcomeKey(outcome.name) === requestedKey) ||
      outcomes.find((outcome) => normalizeOutcomeKey(outcome.name).includes(requestedKey)) ||
      null;

    if (matchingOutcome) {
      return matchingOutcome;
    }
  }

  return outcomes[0] || null;
}

export async function getPolymarketTradingStatus() {
  const config = getSafePolymarketConfig();
  const geoblock = await checkPolymarketGeoblock();

  return {
    config,
    geoblock,
    canTrade: config.tradingConfigured && !geoblock.blocked,
    blockedReason: geoblock.blocked
      ? `Trading is blocked for ${geoblock.country || "this IP"}${geoblock.region ? `/${geoblock.region}` : ""}.`
      : config.tradingConfigured
        ? ""
        : "Trading credentials are not configured yet."
  };
}

export async function placePolymarketLimitOrder({
  marketId,
  marketSlug,
  outcomeName,
  price,
  size,
  side = "BUY",
  orderType = "GTC"
} = {}) {
  const market = await getPolymarketMarket(marketId || marketSlug);
  const outcome = resolvePolymarketOutcome(market, outcomeName);

  if (!market.acceptingOrders) {
    throw buildStatusError("This market is not accepting orders right now.", 400);
  }

  if (!outcome?.tokenId) {
    throw buildStatusError("The selected Polymarket outcome does not have a tradable token id.", 400);
  }

  const numericPrice = Number(price);
  const numericSize = Number(size);

  if (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice >= 1) {
    throw buildStatusError("Order price must be a probability between 0 and 1.", 400);
  }

  if (!Number.isFinite(numericSize) || numericSize <= 0) {
    throw buildStatusError("Order size must be greater than zero.", 400);
  }

  if (market.orderMinSize && numericSize < market.orderMinSize) {
    throw buildStatusError(
      `Order size must be at least ${market.orderMinSize} shares for this market.`,
      400
    );
  }

  const tradingStatus = await getPolymarketTradingStatus();

  if (tradingStatus.geoblock.blocked) {
    throw buildStatusError(tradingStatus.blockedReason, 403);
  }

  if (!tradingStatus.config.tradingConfigured) {
    throw buildStatusError("Trading credentials are not configured yet.", 400);
  }

  const normalizedSide = String(side || "BUY").trim().toUpperCase() === "SELL" ? Side.SELL : Side.BUY;
  const normalizedOrderType =
    String(orderType || "GTC").trim().toUpperCase() === "GTD"
      ? OrderType.GTD
      : OrderType.GTC;
  const { client, account, funderAddress } = await createAuthenticatedClient();
  const feeRateBps = await getPolymarketFeeRateBps(outcome.tokenId);
  const providerResponse = await client.createAndPostOrder(
    {
      tokenID: outcome.tokenId,
      price: round(numericPrice, 4),
      size: round(numericSize, 4),
      side: normalizedSide,
      feeRateBps
    },
    {
      tickSize: normalizeTickSize(market.orderPriceMinTickSize),
      negRisk: Boolean(market.negRisk)
    },
    normalizedOrderType
  );

  return {
    market,
    outcome,
    order: {
      side: normalizedSide,
      orderType: normalizedOrderType,
      price: round(numericPrice, 4),
      size: round(numericSize, 4),
      estimatedCost: round(numericPrice * numericSize, 2),
      feeRateBps
    },
    signerAddress: account.address,
    funderAddress,
    geoblock: tradingStatus.geoblock,
    providerResponse
  };
}
