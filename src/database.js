import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const DATABASE_PATH = fileURLToPath(new URL("../data/x-ticker.sqlite", import.meta.url));

let database = null;

function ensureDirectory() {
  mkdirSync(dirname(DATABASE_PATH), { recursive: true });
}

function initializeSchema(db) {
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      handle TEXT NOT NULL UNIQUE,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sources_handle
      ON sources(handle);

    CREATE TABLE IF NOT EXISTS tweets (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tweets_created_at
      ON tweets(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tweets_source_id
      ON tweets(source_id);

    CREATE TABLE IF NOT EXISTS extraction_cache (
      fingerprint TEXT PRIMARY KEY,
      prompt_version TEXT NOT NULL,
      model TEXT NOT NULL,
      post_id TEXT,
      source_id TEXT,
      cached_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_extraction_cache_post_id
      ON extraction_cache(post_id);

    CREATE TABLE IF NOT EXISTS impact_mapping_cache (
      fingerprint TEXT PRIMARY KEY,
      prompt_version TEXT NOT NULL,
      model TEXT NOT NULL,
      post_id TEXT,
      source_id TEXT,
      cached_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_impact_mapping_cache_post_id
      ON impact_mapping_cache(post_id);

    CREATE TABLE IF NOT EXISTS post_verification_overrides (
      post_id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_post_verification_overrides_updated_at
      ON post_verification_overrides(updated_at DESC);

    CREATE TABLE IF NOT EXISTS x_user_cache (
      handle TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_x_user_cache_updated_at
      ON x_user_cache(updated_at DESC);

    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      dependency_key TEXT NOT NULL,
      trigger TEXT NOT NULL,
      reason TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_generated_at
      ON pipeline_runs(generated_at DESC);

    CREATE TABLE IF NOT EXISTS decision_history (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      asset TEXT NOT NULL,
      action TEXT NOT NULL,
      outcome_state TEXT NOT NULL,
      last_updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_decision_history_generated_at
      ON decision_history(generated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_decision_history_asset
      ON decision_history(asset);

    CREATE TABLE IF NOT EXISTS decision_reviews (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      run_id TEXT NOT NULL,
      asset TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reviewed_at TEXT,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_decision_reviews_updated_at
      ON decision_reviews(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_decision_reviews_status
      ON decision_reviews(status);

    CREATE INDEX IF NOT EXISTS idx_decision_reviews_asset
      ON decision_reviews(asset);

    CREATE TABLE IF NOT EXISTS research_dossiers (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      title TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_research_dossiers_updated_at
      ON research_dossiers(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_research_dossiers_status
      ON research_dossiers(status);

    CREATE INDEX IF NOT EXISTS idx_research_dossiers_theme
      ON research_dossiers(theme);

    CREATE TABLE IF NOT EXISTS eval_runs (
      id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      trigger TEXT NOT NULL,
      gate_passed INTEGER NOT NULL DEFAULT 1,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_eval_runs_generated_at
      ON eval_runs(generated_at DESC);

    CREATE TABLE IF NOT EXISTS runtime_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      related_run_id TEXT,
      error_message TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_jobs_requested_at
      ON runtime_jobs(requested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_runtime_jobs_type
      ON runtime_jobs(type);

    CREATE TABLE IF NOT EXISTS manual_post_processing (
      post_id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_manual_post_processing_processed_at
      ON manual_post_processing(processed_at DESC);

    CREATE TABLE IF NOT EXISTS notification_events (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      error_message TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notification_events_created_at
      ON notification_events(created_at DESC);

    CREATE TABLE IF NOT EXISTS financial_profiles (
      id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_financial_profiles_updated_at
      ON financial_profiles(updated_at DESC);

    CREATE TABLE IF NOT EXISTS advisor_answers (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      asset_ticker TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_advisor_answers_created_at
      ON advisor_answers(created_at DESC);

    CREATE TABLE IF NOT EXISTS polymarket_analyses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      market_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_polymarket_analyses_created_at
      ON polymarket_analyses(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_polymarket_analyses_market_id
      ON polymarket_analyses(market_id);

    CREATE TABLE IF NOT EXISTS polymarket_orders (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      market_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_polymarket_orders_created_at
      ON polymarket_orders(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_polymarket_orders_market_id
      ON polymarket_orders(market_id);

    CREATE TABLE IF NOT EXISTS paper_trades (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      asset TEXT NOT NULL,
      status TEXT NOT NULL,
      decision_id TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_paper_trades_updated_at
      ON paper_trades(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_paper_trades_asset
      ON paper_trades(asset);

    CREATE INDEX IF NOT EXISTS idx_paper_trades_status
      ON paper_trades(status);

    CREATE TABLE IF NOT EXISTS linkedin_drafts (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_type TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_linkedin_drafts_created_at
      ON linkedin_drafts(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_linkedin_drafts_status
      ON linkedin_drafts(status);
  `);
}

function tableHasColumn(db, tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

function ensureColumn(db, tableName, columnName, columnDefinition) {
  if (tableHasColumn(db, tableName, columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

function migratePolymarketSchema(db) {
  ensureColumn(db, "polymarket_analyses", "token_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "polymarket_analyses", "slug", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "polymarket_analyses", "status", "TEXT NOT NULL DEFAULT 'recorded'");
  ensureColumn(db, "polymarket_analyses", "stance", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "polymarket_orders", "market_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "polymarket_orders", "status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn(db, "polymarket_orders", "payload", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "polymarket_orders", "updated_at", "TEXT NOT NULL DEFAULT ''");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_polymarket_analyses_status
      ON polymarket_analyses(status);

    CREATE INDEX IF NOT EXISTS idx_polymarket_analyses_token_id
      ON polymarket_analyses(token_id);

    CREATE INDEX IF NOT EXISTS idx_polymarket_orders_status
      ON polymarket_orders(status);
  `);
}

export function getDatabase() {
  if (database) {
    return database;
  }

  ensureDirectory();
  database = new DatabaseSync(DATABASE_PATH);
  initializeSchema(database);
  migratePolymarketSchema(database);
  return database;
}

export function parseJsonColumn(value, fallbackValue) {
  try {
    return value ? JSON.parse(value) : fallbackValue;
  } catch (_error) {
    return fallbackValue;
  }
}

export function writeMetadata(key, value) {
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO metadata(key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `
  ).run(String(key), String(value ?? ""));
}

export function writeMetadataEntries(entries) {
  const db = getDatabase();
  db.exec("BEGIN");

  try {
    const statement = db.prepare(
      `
        INSERT INTO metadata(key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `
    );

    for (const [key, value] of Object.entries(entries)) {
      statement.run(String(key), String(value ?? ""));
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function readMetadata(key, fallbackValue = "") {
  const db = getDatabase();
  const row = db.prepare("SELECT value FROM metadata WHERE key = ?").get(String(key));
  return row?.value ?? fallbackValue;
}

export function readMetadataJson(key, fallbackValue = null) {
  return parseJsonColumn(readMetadata(key, ""), fallbackValue);
}

export function tableHasRows(tableName) {
  const db = getDatabase();
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
  return Number(row?.count || 0) > 0;
}

export function getDatabasePath() {
  return DATABASE_PATH;
}
