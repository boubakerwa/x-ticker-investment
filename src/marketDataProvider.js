import { monitoredUniverse } from "./data.js";

const MARKET_PROVIDER_VERSION = {
  mock: "mock-market-v2",
  stooq: "stooq-daily-v1"
};

const stooqSymbolMap = {
  NVDA: "nvda.us",
  AMD: "amd.us",
  TSM: "tsm.us",
  MSFT: "msft.us",
  META: "meta.us",
  SOXX: "soxx.us",
  QQQ: "qqq.us",
  BTC: "btcusd"
};

const basePrices = {
  NVDA: 925,
  AMD: 162,
  TSM: 178,
  MSFT: 448,
  META: 601,
  SOXX: 261,
  QQQ: 527,
  BTC: 68250
};

function seededValue(seedString) {
  let hash = 0;

  for (const char of seedString) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000_007;
  }

  return (hash % 10_000) / 10_000;
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function formatPercent(value) {
  const pct = round(value * 100, 1);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function formatVolume(value) {
  return `${round(value, 2)}x`;
}

function buildRegime(asset, returns5d, relativeStrength, volatilityScore) {
  if (asset.ticker === "BTC") {
    return relativeStrength > 0 && volatilityScore < 0.7
      ? "Risk-on, crypto-supported"
      : "Risk-on, leverage-sensitive";
  }

  if (returns5d > 0.045 && relativeStrength > 0) {
    return asset.bucket.includes("Semis") || asset.ticker === "SOXX"
      ? "Risk-on, semi-led"
      : "Constructive, momentum-supported";
  }

  if (returns5d < -0.015 || relativeStrength < -0.02) {
    return "Diverging";
  }

  return "Constructive";
}

function normalizeProvider(value) {
  const normalizedValue = String(value || "auto").trim().toLowerCase();

  if (normalizedValue === "mock" || normalizedValue === "stooq") {
    return normalizedValue;
  }

  return "auto";
}

export function getMarketProviderConfig() {
  const requestedProvider = normalizeProvider(process.env.MARKET_DATA_PROVIDER || "auto");

  return {
    requestedProvider,
    timeoutMs: Number(process.env.MARKET_DATA_TIMEOUT_MS || 8000)
  };
}

export function getMarketProviderVersion() {
  const config = getMarketProviderConfig();

  if (config.requestedProvider === "stooq") {
    return MARKET_PROVIDER_VERSION.stooq;
  }

  if (config.requestedProvider === "mock") {
    return MARKET_PROVIDER_VERSION.mock;
  }

  return `${MARKET_PROVIDER_VERSION.stooq}+fallback:${MARKET_PROVIDER_VERSION.mock}`;
}

function buildMockAssetMarketData(asset, generatedAt) {
  const dateSeed = new Date(generatedAt).toISOString().slice(0, 10);
  const seed = `${asset.ticker}:${dateSeed}`;
  const price = basePrices[asset.ticker] || 100;
  const returns1d = seededValue(`${seed}:1d`) * 0.07 - 0.025;
  const returns5d = seededValue(`${seed}:5d`) * 0.14 - 0.03;
  const returns10d = returns5d + (seededValue(`${seed}:10d`) * 0.08 - 0.01);
  const relativeStrength = seededValue(`${seed}:rel`) * 0.08 - 0.03;
  const volumeRatio = 0.85 + seededValue(`${seed}:vol`) * 1.4;
  const volatilityScore = 0.35 + seededValue(`${seed}:volatility`) * 0.55;
  const lastPrice = round(price * (1 + returns1d));

  return {
    ticker: asset.ticker,
    providerVersion: MARKET_PROVIDER_VERSION.mock,
    generatedAt,
    lastPrice,
    returns1d,
    returns5d,
    returns10d,
    relativeStrength,
    volumeRatio,
    volatilityScore,
    regime: buildRegime(asset, returns5d, relativeStrength, volatilityScore),
    display: {
      lastPrice:
        asset.ticker === "BTC"
          ? `$${lastPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
          : `$${lastPrice.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}`,
      returns1d: formatPercent(returns1d),
      returns5d: formatPercent(returns5d),
      returns10d: formatPercent(returns10d),
      relativeStrength: formatPercent(relativeStrength),
      volumeRatio: formatVolume(volumeRatio),
      volatility:
        volatilityScore >= 0.72
          ? "Elevated"
          : volatilityScore >= 0.56
            ? "Moderate"
            : "Contained"
    }
  };
}

function parseCsv(text) {
  const [headerLine, ...lines] = String(text || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (!headerLine || !lines.length) {
    return [];
  }

  const headers = headerLine.split(",").map((item) => item.trim());

  return lines
    .map((line) => {
      const values = line.split(",");
      const entry = {};

      headers.forEach((header, index) => {
        entry[header] = values[index] ?? "";
      });

      return entry;
    })
    .filter((row) => row.Date && row.Close && row.Close !== "N/D");
}

async function fetchStooqHistory(asset, timeoutMs) {
  const symbol = stooqSymbolMap[asset.ticker];

  if (!symbol) {
    throw new Error(`No Stooq symbol mapping for ${asset.ticker}.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://stooq.com/q/d/l/?s=${symbol}&i=d`, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Stooq request failed with ${response.status}`);
    }

    const text = await response.text();
    const rows = parseCsv(text);

    if (rows.length < 11) {
      throw new Error(`Stooq history for ${asset.ticker} is too short.`);
    }

    return rows;
  } finally {
    clearTimeout(timer);
  }
}

function computeVolatility(closes) {
  if (closes.length < 6) {
    return 0.5;
  }

  const returns = [];

  for (let index = 1; index < closes.length; index += 1) {
    const previousClose = closes[index - 1];
    const close = closes[index];

    if (!Number.isFinite(previousClose) || !Number.isFinite(close) || previousClose === 0) {
      continue;
    }

    returns.push((close - previousClose) / previousClose);
  }

  if (!returns.length) {
    return 0.5;
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(returns.length, 1);

  return round(Math.min(1, Math.sqrt(variance) * 20 + 0.2), 3);
}

function buildDisplayForAsset(asset, lastPrice, returns1d, returns5d, returns10d, relativeStrength, volumeRatio, volatilityScore) {
  return {
    lastPrice:
      asset.ticker === "BTC"
        ? `$${lastPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
        : `$${lastPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    returns1d: formatPercent(returns1d),
    returns5d: formatPercent(returns5d),
    returns10d: formatPercent(returns10d),
    relativeStrength: formatPercent(relativeStrength),
    volumeRatio: formatVolume(volumeRatio),
    volatility:
      volatilityScore >= 0.72
        ? "Elevated"
        : volatilityScore >= 0.56
          ? "Moderate"
          : "Contained"
  };
}

function buildSnapshotFromAssets({
  providerVersion,
  generatedAt,
  assets,
  requestedProvider,
  activeProvider,
  warnings = []
}) {
  const averageReturns5d =
    assets.reduce((sum, asset) => sum + asset.returns5d, 0) / Math.max(assets.length, 1);
  const averageRelativeStrength =
    assets.reduce((sum, asset) => sum + asset.relativeStrength, 0) / Math.max(assets.length, 1);
  const strongest = [...assets].sort(
    (left, right) =>
      right.returns5d + right.relativeStrength - (left.returns5d + left.relativeStrength)
  )[0];

  return {
    providerVersion,
    requestedProvider,
    activeProvider,
    generatedAt,
    warnings,
    summary: {
      marketRegime:
        averageReturns5d > 0.03 && averageRelativeStrength > 0
          ? "Risk-on"
          : averageReturns5d < -0.01
            ? "Risk-off"
            : "Mixed",
      strongestTicker: strongest?.ticker || "",
      averageReturns5d: formatPercent(averageReturns5d),
      averageRelativeStrength: formatPercent(averageRelativeStrength)
    },
    assets,
    byTicker: Object.fromEntries(assets.map((asset) => [asset.ticker, asset]))
  };
}

async function buildStooqAssetData(asset, timeoutMs) {
  const rows = await fetchStooqHistory(asset, timeoutMs);
  const trailingRows = rows.slice(-12);
  const closes = trailingRows.map((row) => Number(row.Close)).filter(Number.isFinite);
  const volumes = trailingRows
    .map((row) => Number(row.Volume))
    .filter((value) => Number.isFinite(value) && value > 0);
  const lastClose = closes.at(-1);
  const prevClose = closes.at(-2);
  const close5d = closes.at(-6);
  const close10d = closes.at(-11);
  const returns1d = prevClose ? (lastClose - prevClose) / prevClose : 0;
  const returns5d = close5d ? (lastClose - close5d) / close5d : returns1d;
  const returns10d = close10d ? (lastClose - close10d) / close10d : returns5d;
  const averageVolume =
    volumes.length > 1 ? volumes.slice(0, -1).reduce((sum, value) => sum + value, 0) / (volumes.length - 1) : null;
  const lastVolume = volumes.at(-1) || averageVolume || 1;
  const volumeRatio = averageVolume ? lastVolume / averageVolume : 1;
  const volatilityScore = computeVolatility(closes);

  return {
    ticker: asset.ticker,
    providerVersion: MARKET_PROVIDER_VERSION.stooq,
    lastPrice: round(lastClose, asset.ticker === "BTC" ? 2 : 2),
    returns1d,
    returns5d,
    returns10d,
    volumeRatio,
    volatilityScore
  };
}

async function buildStooqSnapshot({ generatedAt, universe, config }) {
  const warnings = [];
  const providerRows = await Promise.allSettled(
    universe.map((asset) => buildStooqAssetData(asset, config.timeoutMs))
  );
  const successfulRows = providerRows
    .map((result, index) => ({
      result,
      asset: universe[index]
    }))
    .filter(({ result }) => result.status === "fulfilled");

  if (!successfulRows.length) {
    throw new Error("Stooq did not return enough market data.");
  }

  if (successfulRows.length !== universe.length) {
    for (const row of providerRows) {
      if (row.status === "rejected") {
        warnings.push(String(row.reason?.message || row.reason || "Unknown market-data error."));
      }
    }
  }

  const averageReturns5d =
    successfulRows.reduce((sum, row) => sum + row.result.value.returns5d, 0) /
    Math.max(successfulRows.length, 1);
  const assets = universe.map((asset) => {
    const matched = successfulRows.find((row) => row.asset.ticker === asset.ticker);

    if (!matched) {
      return buildMockAssetMarketData(asset, generatedAt);
    }

    const baseAsset = matched.result.value;
    const relativeStrength = round(baseAsset.returns5d - averageReturns5d, 4);

    return {
      ...baseAsset,
      generatedAt,
      relativeStrength,
      regime: buildRegime(asset, baseAsset.returns5d, relativeStrength, baseAsset.volatilityScore),
      display: buildDisplayForAsset(
        asset,
        baseAsset.lastPrice,
        baseAsset.returns1d,
        baseAsset.returns5d,
        baseAsset.returns10d,
        relativeStrength,
        baseAsset.volumeRatio,
        baseAsset.volatilityScore
      )
    };
  });

  return buildSnapshotFromAssets({
    providerVersion: MARKET_PROVIDER_VERSION.stooq,
    generatedAt,
    assets,
    requestedProvider: config.requestedProvider,
    activeProvider: "stooq",
    warnings
  });
}

function buildMockSnapshot({ generatedAt, universe, requestedProvider, warnings = [] }) {
  const assets = universe.map((asset) => buildMockAssetMarketData(asset, generatedAt));

  return buildSnapshotFromAssets({
    providerVersion: MARKET_PROVIDER_VERSION.mock,
    generatedAt,
    assets,
    requestedProvider,
    activeProvider: "mock",
    warnings
  });
}

export async function buildMarketSnapshot({
  generatedAt,
  universe = monitoredUniverse,
  config = getMarketProviderConfig()
}) {
  if (config.requestedProvider === "mock") {
    return buildMockSnapshot({
      generatedAt,
      universe,
      requestedProvider: config.requestedProvider
    });
  }

  if (config.requestedProvider === "stooq") {
    try {
      return await buildStooqSnapshot({
        generatedAt,
        universe,
        config
      });
    } catch (error) {
      return buildMockSnapshot({
        generatedAt,
        universe,
        requestedProvider: config.requestedProvider,
        warnings: [String(error.message || error)]
      });
    }
  }

  try {
    return await buildStooqSnapshot({
      generatedAt,
      universe,
      config
    });
  } catch (error) {
    return buildMockSnapshot({
      generatedAt,
      universe,
      requestedProvider: config.requestedProvider,
      warnings: [`Auto provider fell back to mock market data: ${String(error.message || error)}`]
    });
  }
}
