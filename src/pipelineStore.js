import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  getDatabase,
  parseJsonColumn,
  tableHasRows,
  writeMetadataEntries,
  readMetadata
} from "./database.js";

const LEGACY_STORE_PATH = fileURLToPath(new URL("../data/pipeline-store.json", import.meta.url));
const PIPELINE_STORE_VERSION = 2;
const RUN_LIMIT = 24;
const DECISION_HISTORY_LIMIT = 480;
export const DECISION_FOLLOW_UP_STATES = [
  "open",
  "monitoring",
  "confirmed",
  "invalidated",
  "closed"
];

function createDefaultStore() {
  return {
    version: PIPELINE_STORE_VERSION,
    updatedAt: new Date().toISOString(),
    latestRunId: "",
    latestDependencyKey: "",
    latestSnapshot: null,
    runs: [],
    decisionHistory: []
  };
}

function isValidStore(store) {
  return Boolean(
    store &&
      typeof store === "object" &&
      Array.isArray(store.runs) &&
      Array.isArray(store.decisionHistory)
  );
}

function readLegacyStore() {
  if (!existsSync(LEGACY_STORE_PATH)) {
    return createDefaultStore();
  }

  const parsedStore = parseJsonColumn(readFileSync(LEGACY_STORE_PATH, "utf8"), null);

  if (!isValidStore(parsedStore)) {
    return createDefaultStore();
  }

  return parsedStore;
}

function roundMetric(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function parseRunRow(row) {
  return parseJsonColumn(row.payload, null);
}

function parseDecisionHistoryRow(row) {
  return parseJsonColumn(row.payload, null);
}

function normalizeFollowUpState(value, fallbackValue = "open") {
  const normalizedValue = String(value || fallbackValue).trim().toLowerCase();
  return DECISION_FOLLOW_UP_STATES.includes(normalizedValue) ? normalizedValue : fallbackValue;
}

function normalizeOptionalDate(value, fallbackValue = "") {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return fallbackValue;
  }

  const parsedDate = new Date(rawValue);
  return Number.isNaN(parsedDate.getTime()) ? fallbackValue : parsedDate.toISOString();
}

function normalizeTrimmedText(value, maxLength, fallbackValue = "") {
  const normalizedValue = String(value ?? fallbackValue).trim();

  if (!normalizedValue) {
    return "";
  }

  return normalizedValue.slice(0, maxLength);
}

function normalizeDecisionFollowUp(entry = {}, patch = {}) {
  const now = new Date().toISOString();
  const nextFollowUpState = normalizeFollowUpState(
    patch.followUpState ?? entry.followUpState,
    normalizeFollowUpState(entry.followUpState || "open")
  );

  return {
    ...entry,
    followUpState: nextFollowUpState,
    nextReviewAt: normalizeOptionalDate(patch.nextReviewAt ?? entry.nextReviewAt, ""),
    outcomeNote: normalizeTrimmedText(patch.outcomeNote ?? entry.outcomeNote, 2000),
    invalidationReason: normalizeTrimmedText(
      patch.invalidationReason ?? entry.invalidationReason,
      800
    ),
    postmortem: normalizeTrimmedText(patch.postmortem ?? entry.postmortem, 6000),
    followUpUpdatedAt: now
  };
}

function computeReturn(referencePrice, latestPrice) {
  const reference = Number(referencePrice);
  const latest = Number(latestPrice);

  if (!Number.isFinite(reference) || !Number.isFinite(latest) || reference === 0) {
    return null;
  }

  return roundMetric((latest - reference) / reference);
}

function computeDirectionalReturn(action, returnSinceDecision) {
  if (returnSinceDecision == null) {
    return null;
  }

  if (action === "SELL") {
    return roundMetric(-returnSinceDecision);
  }

  if (action === "HOLD") {
    return roundMetric(-Math.abs(returnSinceDecision));
  }

  return returnSinceDecision;
}

function classifyOutcomeState(action, directionalReturn, absoluteReturn) {
  if (directionalReturn == null || absoluteReturn == null) {
    return "open";
  }

  if (action === "HOLD") {
    return Math.abs(absoluteReturn) <= 0.03
      ? "stable"
      : absoluteReturn > 0
        ? "escaped-up"
        : "escaped-down";
  }

  if (directionalReturn >= 0.03) {
    return "favorable";
  }

  if (directionalReturn <= -0.03) {
    return "against";
  }

  return "mixed";
}

function refreshOutcomeMetrics(entry, marketByTicker, updatedAt) {
  const marketData = marketByTicker[entry.asset];
  const latestPrice =
    Number.isFinite(Number(marketData?.lastPrice)) ? Number(marketData.lastPrice) : entry.latestPrice ?? null;
  const latestPriceDisplay = marketData?.display?.lastPrice || entry.latestPriceDisplay || "";
  const returnSinceDecision = computeReturn(entry.referencePrice, latestPrice);
  const directionalReturn = computeDirectionalReturn(entry.action, returnSinceDecision);
  const ageHours =
    (new Date(updatedAt).getTime() - new Date(entry.generatedAt).getTime()) / (60 * 60 * 1000);
  const nextEntry = {
    ...entry,
    latestPrice,
    latestPriceDisplay,
    returnSinceDecision,
    directionalReturn,
    outcomeState: classifyOutcomeState(entry.action, directionalReturn, returnSinceDecision),
    lastUpdatedAt: updatedAt
  };

  if (returnSinceDecision != null && ageHours >= 24 && nextEntry.return1d == null) {
    nextEntry.return1d = returnSinceDecision;
  }

  if (returnSinceDecision != null && ageHours >= 72 && nextEntry.return3d == null) {
    nextEntry.return3d = returnSinceDecision;
  }

  if (returnSinceDecision != null && ageHours >= 168 && nextEntry.return7d == null) {
    nextEntry.return7d = returnSinceDecision;
  }

  return nextEntry;
}

function buildDecisionHistoryEntries(run) {
  const marketByTicker = run.market?.byTicker || {};

  return run.decisions.map((decision) => {
    const marketData = marketByTicker[decision.asset];

    return refreshOutcomeMetrics(
      {
        id: `${run.id}:${decision.asset}`,
        runId: run.id,
        generatedAt: run.generatedAt,
        asset: decision.asset,
        action: decision.action,
        confidence: decision.confidence,
        horizon: decision.horizon,
        clusterIds: decision.clusterIds,
        vetoed: decision.vetoed,
        vetoReason: decision.vetoReason,
        summary: decision.rationale[0],
        referencePrice: Number.isFinite(Number(marketData?.lastPrice)) ? Number(marketData.lastPrice) : null,
        referencePriceDisplay: marketData?.display?.lastPrice || "",
        latestPrice: Number.isFinite(Number(marketData?.lastPrice)) ? Number(marketData.lastPrice) : null,
        latestPriceDisplay: marketData?.display?.lastPrice || "",
        returnSinceDecision: 0,
        directionalReturn: decision.action === "HOLD" ? 0 : 0,
        return1d: null,
        return3d: null,
        return7d: null,
        outcomeState: "open",
        lastUpdatedAt: run.generatedAt,
        followUpState: "open",
        nextReviewAt: "",
        outcomeNote: "",
        invalidationReason: "",
        postmortem: "",
        followUpUpdatedAt: ""
      },
      marketByTicker,
      run.generatedAt
    );
  });
}

function upsertDecisionHistoryEntry(entry) {
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO decision_history(
        id,
        run_id,
        generated_at,
        asset,
        action,
        outcome_state,
        last_updated_at,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        run_id = excluded.run_id,
        generated_at = excluded.generated_at,
        asset = excluded.asset,
        action = excluded.action,
        outcome_state = excluded.outcome_state,
        last_updated_at = excluded.last_updated_at,
        payload = excluded.payload
    `
  ).run(
    entry.id,
    entry.runId,
    entry.generatedAt,
    entry.asset,
    entry.action,
    entry.outcomeState || "open",
    entry.lastUpdatedAt || entry.generatedAt || new Date().toISOString(),
    JSON.stringify(entry)
  );
}

function trimRuns() {
  const db = getDatabase();
  const staleRows = db
    .prepare(
      `
        SELECT id
        FROM pipeline_runs
        ORDER BY generated_at DESC
        LIMIT -1 OFFSET ?
      `
    )
    .all(RUN_LIMIT);

  if (!staleRows.length) {
    return;
  }

  const deleteStatement = db.prepare("DELETE FROM pipeline_runs WHERE id = ?");

  for (const row of staleRows) {
    deleteStatement.run(row.id);
  }
}

function trimDecisionHistory() {
  const db = getDatabase();
  const staleRows = db
    .prepare(
      `
        SELECT id
        FROM decision_history
        ORDER BY generated_at DESC
        LIMIT -1 OFFSET ?
      `
    )
    .all(DECISION_HISTORY_LIMIT);

  if (!staleRows.length) {
    return;
  }

  const deleteStatement = db.prepare("DELETE FROM decision_history WHERE id = ?");

  for (const row of staleRows) {
    deleteStatement.run(row.id);
  }
}

function seedPipelineStoreIfNeeded() {
  if (tableHasRows("pipeline_runs") || tableHasRows("decision_history")) {
    return;
  }

  const legacyStore = readLegacyStore();
  const db = getDatabase();
  const insertRun = db.prepare(
    `
      INSERT OR IGNORE INTO pipeline_runs(id, generated_at, dependency_key, trigger, reason, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `
  );
  const insertDecision = db.prepare(
    `
      INSERT OR IGNORE INTO decision_history(id, run_id, generated_at, asset, action, outcome_state, last_updated_at, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  );

  db.exec("BEGIN");

  try {
    for (const run of legacyStore.runs || []) {
      insertRun.run(
        run.id,
        run.generatedAt,
        String(run.dependencyKey || ""),
        String(run.trigger || "legacy-import"),
        String(run.reason || ""),
        JSON.stringify(run)
      );
    }

    for (const entry of legacyStore.decisionHistory || []) {
      insertDecision.run(
        entry.id,
        entry.runId,
        entry.generatedAt,
        entry.asset,
        entry.action,
        String(entry.outcomeState || "open"),
        String(entry.lastUpdatedAt || entry.generatedAt || new Date().toISOString()),
        JSON.stringify(entry)
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  writeMetadataEntries({
    pipeline_latest_run_id: legacyStore.latestRunId || "",
    pipeline_latest_dependency_key: legacyStore.latestDependencyKey || "",
    pipeline_updated_at: legacyStore.updatedAt || new Date().toISOString()
  });
}

function readRuns(limit = RUN_LIMIT) {
  seedPipelineStoreIfNeeded();
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM pipeline_runs
        ORDER BY generated_at DESC
        LIMIT ?
      `
    )
    .all(limit);

  return rows.map((row) => parseRunRow(row)).filter(Boolean);
}

function readDecisionHistoryEntries(limit = DECISION_HISTORY_LIMIT) {
  seedPipelineStoreIfNeeded();
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM decision_history
        ORDER BY generated_at DESC
        LIMIT ?
      `
    )
    .all(limit);

  return rows.map((row) => parseDecisionHistoryRow(row)).filter(Boolean);
}

function getLatestRun() {
  return readRuns(1)[0] || null;
}

export function readPipelineStore() {
  const latestRun = getLatestRun();

  return {
    version: PIPELINE_STORE_VERSION,
    updatedAt: readMetadata("pipeline_updated_at", latestRun?.generatedAt || new Date().toISOString()),
    latestRunId: latestRun?.id || readMetadata("pipeline_latest_run_id", ""),
    latestDependencyKey:
      latestRun?.dependencyKey || readMetadata("pipeline_latest_dependency_key", ""),
    latestSnapshot: latestRun?.snapshot || null,
    runs: readRuns(RUN_LIMIT),
    decisionHistory: readDecisionHistoryEntries(DECISION_HISTORY_LIMIT)
  };
}

export function getLatestPipelineSnapshot() {
  return getLatestRun()?.snapshot || null;
}

export function isPipelineSnapshotCurrent(dependencyKey) {
  const latestRun = getLatestRun();
  return Boolean(latestRun?.snapshot && latestRun.dependencyKey === dependencyKey);
}

export function listPipelineRuns(limit = RUN_LIMIT) {
  return readRuns(limit);
}

export function getPipelineRun(runId) {
  seedPipelineStoreIfNeeded();
  const db = getDatabase();
  const row = db.prepare("SELECT payload FROM pipeline_runs WHERE id = ?").get(runId);
  return row ? parseRunRow(row) : null;
}

export function listDecisionHistory(limit = DECISION_HISTORY_LIMIT) {
  return readDecisionHistoryEntries(limit);
}

export function getDecisionHistoryEntry(entryId) {
  seedPipelineStoreIfNeeded();
  const db = getDatabase();
  const row = db.prepare("SELECT payload FROM decision_history WHERE id = ?").get(String(entryId || ""));
  return row ? parseDecisionHistoryRow(row) : null;
}

export function updateDecisionHistoryEntry(entryId, patch = {}) {
  const currentEntry = getDecisionHistoryEntry(entryId);

  if (!currentEntry) {
    throw new Error("Decision history entry not found.");
  }

  const nextEntry = normalizeDecisionFollowUp(currentEntry, patch);
  upsertDecisionHistoryEntry(nextEntry);
  return nextEntry;
}

export function persistPipelineRun(run) {
  seedPipelineStoreIfNeeded();
  const db = getDatabase();
  const currentHistory = readDecisionHistoryEntries(DECISION_HISTORY_LIMIT);
  const marketByTicker = run.market?.byTicker || {};
  const refreshedExistingHistory = currentHistory.map((entry) =>
    refreshOutcomeMetrics(entry, marketByTicker, run.generatedAt)
  );
  const newEntries = buildDecisionHistoryEntries(run);
  const nextDecisionHistory = [...newEntries, ...refreshedExistingHistory.filter((entry) => entry.runId !== run.id)]
    .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime())
    .slice(0, DECISION_HISTORY_LIMIT);

  db.exec("BEGIN");

  try {
    db.prepare(
      `
        INSERT INTO pipeline_runs(id, generated_at, dependency_key, trigger, reason, payload)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          generated_at = excluded.generated_at,
          dependency_key = excluded.dependency_key,
          trigger = excluded.trigger,
          reason = excluded.reason,
          payload = excluded.payload
      `
    ).run(
      run.id,
      run.generatedAt,
      run.dependencyKey,
      String(run.trigger || "manual"),
      String(run.reason || ""),
      JSON.stringify(run)
    );

    trimRuns();

    for (const entry of nextDecisionHistory) {
      upsertDecisionHistoryEntry(entry);
    }

    trimDecisionHistory();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  writeMetadataEntries({
    pipeline_latest_run_id: run.id,
    pipeline_latest_dependency_key: run.dependencyKey,
    pipeline_updated_at: new Date().toISOString()
  });

  return readPipelineStore();
}
