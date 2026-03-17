import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  getDatabase,
  parseJsonColumn,
  tableHasRows
} from "./database.js";

const LEGACY_STORE_PATH = fileURLToPath(new URL("../data/eval-history.json", import.meta.url));
const EVAL_STORE_VERSION = 2;
const EVAL_RUN_LIMIT = 40;

function createDefaultStore() {
  return {
    version: EVAL_STORE_VERSION,
    updatedAt: new Date().toISOString(),
    latestRunId: "",
    runs: []
  };
}

function isValidStore(store) {
  return Boolean(store && typeof store === "object" && Array.isArray(store.runs));
}

function sortRuns(runs) {
  return [...runs].sort(
    (left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime()
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

  return {
    ...parsedStore,
    runs: sortRuns(parsedStore.runs)
  };
}

function seedEvalRunsIfNeeded() {
  if (tableHasRows("eval_runs")) {
    return;
  }

  const legacyStore = readLegacyStore();
  const db = getDatabase();
  const insertStatement = db.prepare(
    `
      INSERT OR IGNORE INTO eval_runs(id, generated_at, prompt_version, trigger, gate_passed, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `
  );

  db.exec("BEGIN");

  try {
    for (const run of legacyStore.runs) {
      insertStatement.run(
        run.id,
        run.generatedAt,
        String(run.promptVersion || "heuristic-baseline"),
        String(run.trigger || "legacy-import"),
        run.gate?.passed === false ? 0 : 1,
        JSON.stringify(run)
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function trimEvalRuns() {
  const db = getDatabase();
  const staleRows = db
    .prepare(
      `
        SELECT id
        FROM eval_runs
        ORDER BY generated_at DESC
        LIMIT -1 OFFSET ?
      `
    )
    .all(EVAL_RUN_LIMIT);

  if (!staleRows.length) {
    return;
  }

  const deleteStatement = db.prepare("DELETE FROM eval_runs WHERE id = ?");

  for (const row of staleRows) {
    deleteStatement.run(row.id);
  }
}

function readRuns(limit = EVAL_RUN_LIMIT) {
  seedEvalRunsIfNeeded();
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM eval_runs
        ORDER BY generated_at DESC
        LIMIT ?
      `
    )
    .all(limit);

  return rows.map((row) => parseJsonColumn(row.payload, {}));
}

export function readEvalStore() {
  const runs = readRuns(EVAL_RUN_LIMIT);

  return {
    version: EVAL_STORE_VERSION,
    updatedAt: runs[0]?.generatedAt || new Date().toISOString(),
    latestRunId: runs[0]?.id || "",
    runs
  };
}

export function getLatestEvalRun() {
  return readEvalStore().runs[0] || null;
}

export function listEvalRuns(limit = EVAL_RUN_LIMIT) {
  return readRuns(limit);
}

export function getEvalRun(runId) {
  seedEvalRunsIfNeeded();
  const db = getDatabase();
  const row = db.prepare("SELECT payload FROM eval_runs WHERE id = ?").get(runId);
  return row ? parseJsonColumn(row.payload, null) : null;
}

export function persistEvalRun(run) {
  seedEvalRunsIfNeeded();
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO eval_runs(id, generated_at, prompt_version, trigger, gate_passed, payload)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        generated_at = excluded.generated_at,
        prompt_version = excluded.prompt_version,
        trigger = excluded.trigger,
        gate_passed = excluded.gate_passed,
        payload = excluded.payload
    `
  ).run(
    run.id,
    run.generatedAt,
    String(run.promptVersion || "heuristic-baseline"),
    String(run.trigger || "manual"),
    run.gate?.passed === false ? 0 : 1,
    JSON.stringify(run)
  );

  trimEvalRuns();
  return readEvalStore();
}
