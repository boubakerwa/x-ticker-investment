import { getDatabase, parseJsonColumn } from "./database.js";

const PAPER_TRADE_LIMIT = 240;

export const PAPER_TRADE_STATUSES = [
  "planned",
  "open",
  "closed",
  "invalidated",
  "cancelled"
];

export const PAPER_TRADE_SIDES = ["long", "short"];

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function normalizeString(value, fallbackValue = "") {
  return String(value ?? fallbackValue).trim();
}

function isSyntheticMarketAsset(marketAsset = null, marketSnapshot = null) {
  const providerVersion = normalizeString(
    marketAsset?.providerVersion || marketSnapshot?.activeProvider || ""
  ).toLowerCase();

  return providerVersion.includes("mock") || marketAsset?.synthetic === true;
}

function normalizeStatus(value, fallbackValue = "planned") {
  const normalizedValue = normalizeString(value || fallbackValue).toLowerCase();
  return PAPER_TRADE_STATUSES.includes(normalizedValue) ? normalizedValue : fallbackValue;
}

function normalizeSide(value, fallbackValue = "long") {
  const normalizedValue = normalizeString(value || fallbackValue).toLowerCase();
  return PAPER_TRADE_SIDES.includes(normalizedValue) ? normalizedValue : fallbackValue;
}

function normalizePositiveNumber(value, fallbackValue = null) {
  if (value === "" || value == null) {
    return fallbackValue;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? round(numericValue, 4) : fallbackValue;
}

function normalizeMoney(value, fallbackValue = 0) {
  if (value === "" || value == null) {
    return round(fallbackValue, 2);
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? round(Math.max(0, numericValue), 2) : round(fallbackValue, 2);
}

function normalizeOptionalDate(value, fallbackValue = "") {
  const rawValue = normalizeString(value);

  if (!rawValue) {
    return fallbackValue;
  }

  const parsedDate = new Date(rawValue);
  return Number.isNaN(parsedDate.getTime()) ? fallbackValue : parsedDate.toISOString();
}

function buildPaperTradeId() {
  return `paper-trade-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parsePayloadRow(row) {
  return parseJsonColumn(row.payload, null);
}

function trimPaperTrades() {
  const db = getDatabase();
  const staleRows = db
    .prepare(
      `
        SELECT id
        FROM paper_trades
        ORDER BY created_at DESC
        LIMIT -1 OFFSET ?
      `
    )
    .all(PAPER_TRADE_LIMIT);

  if (!staleRows.length) {
    return;
  }

  const deleteStatement = db.prepare("DELETE FROM paper_trades WHERE id = ?");

  for (const row of staleRows) {
    deleteStatement.run(row.id);
  }
}

function normalizePaperTrade(input = {}, existingTrade = {}) {
  const createdAt =
    normalizeOptionalDate(input.createdAt ?? existingTrade.createdAt) || new Date().toISOString();
  const nextStatus = normalizeStatus(input.status ?? existingTrade.status, existingTrade.status || "planned");
  const now = new Date().toISOString();
  const openedAt =
    normalizeOptionalDate(
      input.openedAt ?? existingTrade.openedAt,
      nextStatus === "open" && !existingTrade.openedAt ? now : existingTrade.openedAt || ""
    ) || "";
  const closedAt =
    normalizeOptionalDate(
      input.closedAt ?? existingTrade.closedAt,
      ["closed", "invalidated", "cancelled"].includes(nextStatus) &&
        !(input.closedAt ?? existingTrade.closedAt)
        ? now
        : existingTrade.closedAt || ""
    ) || "";

  return {
    id: normalizeString(input.id ?? existingTrade.id),
    createdAt,
    updatedAt: normalizeOptionalDate(input.updatedAt ?? existingTrade.updatedAt, now) || now,
    decisionId: normalizeString(input.decisionId ?? existingTrade.decisionId),
    reviewId: normalizeString(input.reviewId ?? existingTrade.reviewId),
    asset: normalizeTicker(input.asset ?? existingTrade.asset),
    decisionAction: normalizeString(
      input.decisionAction ?? existingTrade.decisionAction,
      existingTrade.decisionAction || ""
    ).toUpperCase(),
    reviewStatus: normalizeString(input.reviewStatus ?? existingTrade.reviewStatus),
    side: normalizeSide(input.side ?? existingTrade.side, existingTrade.side || "long"),
    status: nextStatus,
    openedAt,
    closedAt,
    thesis: normalizeString(input.thesis ?? existingTrade.thesis).slice(0, 4000),
    horizon: normalizeString(input.horizon ?? existingTrade.horizon).slice(0, 160),
    invalidationReason: normalizeString(
      input.invalidationReason ?? existingTrade.invalidationReason
    ).slice(0, 1200),
    notes: normalizeString(input.notes ?? existingTrade.notes).slice(0, 3000),
    postmortem: normalizeString(input.postmortem ?? existingTrade.postmortem).slice(0, 6000),
    entryPrice: normalizePositiveNumber(input.entryPrice ?? existingTrade.entryPrice, null),
    entryPriceSource: normalizeString(
      input.entryPriceSource ?? existingTrade.entryPriceSource,
      existingTrade.entryPriceSource || "manual"
    ),
    entryPriceAsOf: normalizeOptionalDate(input.entryPriceAsOf ?? existingTrade.entryPriceAsOf, ""),
    positionSizeUsd: normalizeMoney(input.positionSizeUsd ?? existingTrade.positionSizeUsd, 0),
    feesUsd: normalizeMoney(input.feesUsd ?? existingTrade.feesUsd, 0),
    slippageBps: normalizeMoney(input.slippageBps ?? existingTrade.slippageBps, 0),
    plannedStopPrice: normalizePositiveNumber(
      input.plannedStopPrice ?? existingTrade.plannedStopPrice,
      null
    ),
    plannedTargetPrice: normalizePositiveNumber(
      input.plannedTargetPrice ?? existingTrade.plannedTargetPrice,
      null
    ),
    manualMarkPrice: normalizePositiveNumber(
      input.manualMarkPrice ?? existingTrade.manualMarkPrice,
      null
    ),
    manualMarkAsOf: normalizeOptionalDate(input.manualMarkAsOf ?? existingTrade.manualMarkAsOf, ""),
    exitPrice: normalizePositiveNumber(input.exitPrice ?? existingTrade.exitPrice, null),
    exitPriceAsOf: normalizeOptionalDate(input.exitPriceAsOf ?? existingTrade.exitPriceAsOf, "")
  };
}

function persistPaperTrade(trade) {
  const db = getDatabase();
  const nextTrade = normalizePaperTrade(
    {
      ...trade,
      id: trade?.id || buildPaperTradeId(),
      updatedAt: new Date().toISOString()
    },
    trade
  );

  db.prepare(
    `
      INSERT INTO paper_trades(
        id,
        created_at,
        updated_at,
        asset,
        status,
        decision_id,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        asset = excluded.asset,
        status = excluded.status,
        decision_id = excluded.decision_id,
        payload = excluded.payload
    `
  ).run(
    nextTrade.id,
    nextTrade.createdAt,
    nextTrade.updatedAt,
    nextTrade.asset,
    nextTrade.status,
    nextTrade.decisionId,
    JSON.stringify(nextTrade)
  );

  trimPaperTrades();
  return nextTrade;
}

function resolvePaperTradeMark(trade, marketSnapshot = null) {
  if (trade.exitPrice != null) {
    return {
      price: trade.exitPrice,
      asOf: trade.exitPriceAsOf || trade.closedAt || trade.updatedAt,
      source: "manual-exit",
      warning: ""
    };
  }

  if (trade.manualMarkPrice != null) {
    return {
      price: trade.manualMarkPrice,
      asOf: trade.manualMarkAsOf || trade.updatedAt,
      source: "manual-mark",
      warning: ""
    };
  }

  const marketByTicker = marketSnapshot?.byTicker || {};
  const marketAsset = marketByTicker[trade.asset] || null;

  if (
    marketAsset &&
    Number.isFinite(Number(marketAsset.lastPrice)) &&
    !isSyntheticMarketAsset(marketAsset, marketSnapshot)
  ) {
    return {
      price: Number(marketAsset.lastPrice),
      asOf: marketAsset.generatedAt || marketSnapshot.generatedAt || "",
      source: "market-snapshot",
      warning: ""
    };
  }

  if (marketSnapshot?.activeProvider === "mock") {
    return {
      price: null,
      asOf: "",
      source: "unavailable",
      warning: "Latest market snapshot is synthetic, so open paper trades need a manual mark price."
    };
  }

  return {
    price: null,
    asOf: "",
    source: "unavailable",
    warning: "No usable market mark is available yet for this paper trade."
  };
}

function enrichPaperTrade(trade, marketSnapshot = null) {
  const normalizedTrade = normalizePaperTrade(trade, trade);
  const mark = resolvePaperTradeMark(normalizedTrade, marketSnapshot);
  const entryPrice = Number(normalizedTrade.entryPrice);
  const positionSizeUsd = Number(normalizedTrade.positionSizeUsd || 0);
  const directionMultiplier = normalizedTrade.side === "short" ? -1 : 1;
  const grossReturnPct =
    Number.isFinite(entryPrice) &&
    entryPrice > 0 &&
    Number.isFinite(Number(mark.price)) &&
    mark.price > 0
      ? round((((Number(mark.price) - entryPrice) / entryPrice) * directionMultiplier), 4)
      : null;
  const quantity =
    Number.isFinite(entryPrice) && entryPrice > 0 && positionSizeUsd > 0
      ? round(positionSizeUsd / entryPrice, 6)
      : 0;
  const grossPnlUsd =
    grossReturnPct != null && positionSizeUsd > 0 ? round(positionSizeUsd * grossReturnPct, 2) : null;
  const slippageCostUsd =
    positionSizeUsd > 0 && Number.isFinite(Number(normalizedTrade.slippageBps))
      ? round((positionSizeUsd * Number(normalizedTrade.slippageBps || 0)) / 10_000, 2)
      : 0;
  const totalCostsUsd = round(Number(normalizedTrade.feesUsd || 0) + slippageCostUsd, 2);
  const netPnlUsd =
    grossPnlUsd != null ? round(grossPnlUsd - totalCostsUsd, 2) : null;
  const netReturnPct =
    netPnlUsd != null && positionSizeUsd > 0 ? round(netPnlUsd / positionSizeUsd, 4) : null;

  return {
    ...normalizedTrade,
    quantity,
    markPrice: mark.price,
    markPriceAsOf: mark.asOf,
    markPriceSource: mark.source,
    markWarning: mark.warning,
    grossReturnPct,
    grossPnlUsd,
    slippageCostUsd,
    totalCostsUsd,
    netPnlUsd,
    netReturnPct,
    isMarked: grossReturnPct != null
  };
}

function buildPaperTradeSummary(trades) {
  const closedTrades = trades.filter((trade) =>
    ["closed", "invalidated"].includes(trade.status)
  );
  const openTrades = trades.filter((trade) => trade.status === "open");
  const plannedTrades = trades.filter((trade) => trade.status === "planned");
  const markedTrades = trades.filter((trade) => trade.netReturnPct != null);
  const totalNetPnlUsd = round(
    markedTrades.reduce((sum, trade) => sum + Number(trade.netPnlUsd || 0), 0),
    2
  );
  const winCount = closedTrades.filter((trade) => Number(trade.netReturnPct || 0) > 0).length;
  const manualMarkNeededCount = openTrades.filter((trade) => Boolean(trade.markWarning)).length;

  return {
    totalCount: trades.length,
    plannedCount: plannedTrades.length,
    openCount: openTrades.length,
    closedCount: closedTrades.length,
    markedCount: markedTrades.length,
    winCount,
    lossCount: Math.max(0, closedTrades.length - winCount),
    winRate: closedTrades.length ? round(winCount / closedTrades.length, 4) : 0,
    totalNetPnlUsd,
    manualMarkNeededCount,
    averageOpenReturnPct: openTrades.length
      ? round(
          openTrades.reduce((sum, trade) => sum + Number(trade.netReturnPct || 0), 0) /
            openTrades.length,
          4
        )
      : null,
    averageClosedReturnPct: closedTrades.length
      ? round(
          closedTrades.reduce((sum, trade) => sum + Number(trade.netReturnPct || 0), 0) /
            closedTrades.length,
          4
        )
      : null
  };
}

export function listPaperTrades(limit = PAPER_TRADE_LIMIT, { marketSnapshot = null } = {}) {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM paper_trades
        ORDER BY updated_at DESC
        LIMIT ?
      `
    )
    .all(limit);

  return rows.map((row) => parsePayloadRow(row)).filter(Boolean).map((trade) => enrichPaperTrade(trade, marketSnapshot));
}

export function getPaperTrade(tradeId, { marketSnapshot = null } = {}) {
  const db = getDatabase();
  const row = db.prepare("SELECT payload FROM paper_trades WHERE id = ?").get(String(tradeId || ""));
  return row ? enrichPaperTrade(parsePayloadRow(row), marketSnapshot) : null;
}

export function findActivePaperTradeByDecisionId(decisionId, { marketSnapshot = null } = {}) {
  if (!normalizeString(decisionId)) {
    return null;
  }

  return listPaperTrades(PAPER_TRADE_LIMIT, { marketSnapshot }).find(
    (trade) =>
      trade.decisionId === decisionId && ["planned", "open"].includes(normalizeStatus(trade.status))
  ) || null;
}

export function createPaperTrade(input = {}) {
  return persistPaperTrade(normalizePaperTrade(input));
}

export function updatePaperTrade(tradeId, patch = {}) {
  const db = getDatabase();
  const row = db.prepare("SELECT payload FROM paper_trades WHERE id = ?").get(String(tradeId || ""));
  const currentTrade = row ? parsePayloadRow(row) : null;

  if (!currentTrade) {
    throw new Error("Paper trade not found.");
  }

  return persistPaperTrade({
    ...normalizePaperTrade(currentTrade, currentTrade),
    ...patch,
    id: currentTrade.id,
    createdAt: currentTrade.createdAt
  });
}

export function buildStoredPaperTradingState({ marketSnapshot = null, markProvider = null } = {}) {
  const trades = listPaperTrades(PAPER_TRADE_LIMIT, { marketSnapshot });

  return {
    statuses: PAPER_TRADE_STATUSES,
    sides: PAPER_TRADE_SIDES,
    summary: buildPaperTradeSummary(trades),
    markProvider: markProvider || null,
    trades
  };
}
