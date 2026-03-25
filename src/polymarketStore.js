import { getDatabase, parseJsonColumn } from "./database.js";

const ANALYSIS_LIMIT = 80;
const ORDER_LIMIT = 160;

function buildAnalysisId() {
  return `polymarket-analysis-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildOrderId() {
  return `polymarket-order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parsePayloadRow(row) {
  return parseJsonColumn(row.payload, null);
}

function trimTable(tableName, orderColumn, limit) {
  const db = getDatabase();
  const staleRows = db
    .prepare(
      `
        SELECT id
        FROM ${tableName}
        ORDER BY ${orderColumn} DESC
        LIMIT -1 OFFSET ?
      `
    )
    .all(limit);

  if (!staleRows.length) {
    return;
  }

  const deleteStatement = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`);

  for (const row of staleRows) {
    deleteStatement.run(row.id);
  }
}

export function listPolymarketAnalyses(limit = ANALYSIS_LIMIT) {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM polymarket_analyses
        ORDER BY created_at DESC
        LIMIT ?
      `
    )
    .all(limit);

  return rows.map((row) => parsePayloadRow(row)).filter(Boolean);
}

export function getPolymarketAnalysis(analysisId) {
  const db = getDatabase();
  const row = db
    .prepare("SELECT payload FROM polymarket_analyses WHERE id = ?")
    .get(String(analysisId || ""));

  return row ? parsePayloadRow(row) : null;
}

export function persistPolymarketAnalysis(analysis) {
  const db = getDatabase();
  const id = String(analysis?.id || buildAnalysisId());
  const createdAt = String(analysis?.createdAt || new Date().toISOString());
  const selectedOutcome = String(analysis?.selectedOutcome || "").trim();
  const tokenId =
    (analysis?.marketSnapshot?.outcomes || []).find((outcome) => outcome?.name === selectedOutcome)?.tokenId || "";
  const nextAnalysis = {
    ...analysis,
    id,
    createdAt,
    updatedAt: String(analysis?.updatedAt || createdAt)
  };

  db.prepare(
    `
      INSERT INTO polymarket_analyses(
        id,
        created_at,
        updated_at,
        market_id,
        token_id,
        slug,
        status,
        stance,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        market_id = excluded.market_id,
        token_id = excluded.token_id,
        slug = excluded.slug,
        status = excluded.status,
        stance = excluded.stance,
        payload = excluded.payload
    `
  ).run(
    nextAnalysis.id,
    nextAnalysis.createdAt,
    nextAnalysis.updatedAt,
    String(nextAnalysis.marketId || ""),
    tokenId,
    String(nextAnalysis.marketSlug || ""),
    String(nextAnalysis.status || nextAnalysis.decision || "recorded"),
    String(nextAnalysis.decision || ""),
    JSON.stringify(nextAnalysis)
  );

  trimTable("polymarket_analyses", "created_at", ANALYSIS_LIMIT);
  return nextAnalysis;
}

export function listPolymarketOrderAttempts(limit = ORDER_LIMIT) {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM polymarket_orders
        ORDER BY created_at DESC
        LIMIT ?
      `
    )
    .all(limit);

  return rows.map((row) => parsePayloadRow(row)).filter(Boolean);
}

export function getPolymarketOrderAttempt(orderId) {
  const db = getDatabase();
  const row = db
    .prepare("SELECT payload FROM polymarket_orders WHERE id = ?")
    .get(String(orderId || ""));

  return row ? parsePayloadRow(row) : null;
}

export function persistPolymarketOrderAttempt(orderAttempt) {
  const db = getDatabase();
  const id = String(orderAttempt?.id || buildOrderId());
  const createdAt = String(orderAttempt?.createdAt || new Date().toISOString());
  const updatedAt = String(orderAttempt?.updatedAt || createdAt);
  const nextOrderAttempt = {
    ...orderAttempt,
    id,
    createdAt,
    updatedAt
  };

  db.prepare(
    `
      INSERT INTO polymarket_orders(
        id,
        created_at,
        updated_at,
        market_id,
        status,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        market_id = excluded.market_id,
        status = excluded.status,
        payload = excluded.payload
    `
  ).run(
    nextOrderAttempt.id,
    nextOrderAttempt.createdAt,
    nextOrderAttempt.updatedAt,
    String(nextOrderAttempt.marketId || ""),
    String(nextOrderAttempt.status || "pending"),
    JSON.stringify(nextOrderAttempt)
  );

  trimTable("polymarket_orders", "created_at", ORDER_LIMIT);
  return nextOrderAttempt;
}
