import { monitoredUniverse } from "./data.js";
import { getFredMacroPreview } from "./fredProvider.js";
import { listPolymarketMarkets } from "./polymarketProvider.js";
import { getRecentSecFilings } from "./secEdgarProvider.js";

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function normalizeString(value, fallbackValue = "") {
  return String(value ?? fallbackValue).trim();
}

function containsAny(text, patterns = []) {
  return patterns.some((pattern) => pattern && text.includes(pattern));
}

function buildAssetPolymarketQueries(asset) {
  const bucket = normalizeString(asset?.bucket).toLowerCase();

  if (asset?.ticker === "BTC") {
    return ["bitcoin", "crypto", "fed"];
  }

  if (bucket.includes("semi")) {
    return [asset.name, "semiconductor", "taiwan"];
  }

  if (bucket.includes("tech")) {
    return [asset.name, "nasdaq", "fed"];
  }

  return [asset?.name || asset?.ticker, "fed"];
}

function scorePolymarketMatch(market, asset) {
  const searchText = [
    market.question,
    market.description,
    market.eventTitle,
    market.eventContext,
    market.slug
  ]
    .join(" ")
    .toLowerCase();
  const assetName = normalizeString(asset?.name).toLowerCase();
  const assetTicker = normalizeString(asset?.ticker).toLowerCase();
  const highSignalCatalysts = [
    "fed",
    "rate",
    "rates",
    "inflation",
    "cpi",
    "ppi",
    "yield",
    "recession",
    "tariff",
    "export",
    "etf"
  ];
  const thematicCatalysts = [
    "semiconductor",
    "chip",
    "taiwan",
    "ai",
    "crypto",
    "bitcoin"
  ];
  const directMention = Boolean(
    (assetName && searchText.includes(assetName)) ||
      (assetTicker && searchText.includes(assetTicker))
  );
  const catalystMatch =
    containsAny(searchText, highSignalCatalysts) ||
    containsAny(searchText, thematicCatalysts);
  let score = 0;

  if (assetName && searchText.includes(assetName)) {
    score += 5;
  }

  if (assetTicker && searchText.includes(assetTicker)) {
    score += 4;
  }

  if (containsAny(searchText, highSignalCatalysts)) {
    score += 2;
  }

  if (containsAny(searchText, thematicCatalysts)) {
    score += 1;
  }

  if (Number(market.volume24hr || 0) > 50_000) {
    score += 1;
  }

  if (Number(market.liquidity || 0) > 50_000) {
    score += 1;
  }

  return {
    score,
    directMention,
    catalystMatch
  };
}

function sortAndTrimPolymarketMarkets(markets, asset) {
  return [...markets]
    .map((market) => {
      const match = scorePolymarketMatch(market, asset);

      return {
        ...market,
        matchScore: match.score,
        directMention: match.directMention,
        catalystMatch: match.catalystMatch
      };
    })
    .filter(
      (market) =>
        market.matchScore >= 4 &&
        (market.directMention || market.catalystMatch)
    )
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }

      if ((right.volume24hr || 0) !== (left.volume24hr || 0)) {
        return (right.volume24hr || 0) - (left.volume24hr || 0);
      }

      return (right.liquidity || 0) - (left.liquidity || 0);
    })
    .slice(0, 6);
}

async function getPolymarketAssetContext(asset) {
  const queries = buildAssetPolymarketQueries(asset);
  const results = await Promise.allSettled(
    queries.map((search) =>
      listPolymarketMarkets({
        search,
        limit: 8,
        active: true,
        closed: false
      })
    )
  );
  const rawMarkets = [];
  const seenIds = new Set();
  const warnings = [];

  for (const result of results) {
    if (result.status === "rejected") {
      warnings.push(String(result.reason?.message || result.reason || "Polymarket lookup failed."));
      continue;
    }

    for (const market of result.value.markets || []) {
      if (market?.id && !seenIds.has(market.id)) {
        seenIds.add(market.id);
        rawMarkets.push(market);
      }
    }
  }

  return {
    available: results.some((result) => result.status === "fulfilled"),
    queries,
    note:
      "Use Polymarket as market-implied event context only. It is a probability signal, not a direct trading recommendation.",
    warnings,
    markets: sortAndTrimPolymarketMarkets(rawMarkets, asset)
  };
}

async function getSecAssetContext(asset) {
  if (!asset || asset.type !== "Equity") {
    return {
      available: true,
      supported: false,
      filings: [],
      note: "SEC EDGAR is most useful for single-name equities rather than ETFs or crypto."
    };
  }

  return getRecentSecFilings({
    ticker: asset.ticker
  });
}

export async function buildAssetIntel(ticker) {
  const cleanTicker = normalizeTicker(ticker);
  const asset = monitoredUniverse.find((entry) => entry.ticker === cleanTicker) || null;

  if (!asset) {
    throw new Error("Tracked asset not found.");
  }

  const [polymarket, secEdgar, fred] = await Promise.all([
    getPolymarketAssetContext(asset),
    getSecAssetContext(asset),
    getFredMacroPreview(asset)
  ]);

  return {
    asset,
    generatedAt: new Date().toISOString(),
    polymarket,
    secEdgar,
    fred,
    bluesky: {
      available: false,
      status: "planned",
      note:
        "Planned as an optional low-trust discovery lane. It should never outrank EDGAR, Polymarket, or approved research."
    }
  };
}
