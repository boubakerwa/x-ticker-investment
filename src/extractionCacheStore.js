import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  getDatabase,
  parseJsonColumn,
  tableHasRows
} from "./database.js";

const LEGACY_STORE_PATH = fileURLToPath(new URL("../data/extraction-cache.json", import.meta.url));
const CACHE_VERSION = 2;

function createDefaultStore() {
  return {
    version: CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    entries: {}
  };
}

function isValidStore(store) {
  return Boolean(
    store &&
      typeof store === "object" &&
      !Array.isArray(store) &&
      store.entries &&
      typeof store.entries === "object" &&
      !Array.isArray(store.entries)
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

function seedCacheIfNeeded() {
  if (tableHasRows("extraction_cache")) {
    return;
  }

  const legacyStore = readLegacyStore();
  const db = getDatabase();
  const insertStatement = db.prepare(
    `
      INSERT OR IGNORE INTO extraction_cache(
        fingerprint,
        prompt_version,
        model,
        post_id,
        source_id,
        cached_at,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  );

  db.exec("BEGIN");

  try {
    for (const [fingerprint, entry] of Object.entries(legacyStore.entries || {})) {
      const cachedAt = String(entry.cachedAt || legacyStore.updatedAt || new Date().toISOString());
      insertStatement.run(
        fingerprint,
        String(entry.promptVersion || ""),
        String(entry.model || ""),
        String(entry.postId || ""),
        String(entry.sourceId || ""),
        cachedAt,
        JSON.stringify(entry)
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function readExtractionCache() {
  seedCacheIfNeeded();
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT fingerprint, payload, cached_at
        FROM extraction_cache
      `
    )
    .all();

  const entries = Object.fromEntries(
    rows.map((row) => [row.fingerprint, parseJsonColumn(row.payload, {})])
  );
  const latestUpdatedAt =
    rows
      .map((row) => row.cached_at)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ||
    new Date().toISOString();

  return {
    version: CACHE_VERSION,
    updatedAt: latestUpdatedAt,
    entries
  };
}

export function buildExtractionFingerprint({
  promptVersion,
  model,
  post,
  source
}) {
  const hash = createHash("sha1");

  hash.update(
    JSON.stringify({
      promptVersion,
      model,
      post: {
        id: post.id,
        sourceId: post.sourceId,
        createdAt: post.createdAt,
        body: post.body
      },
      source: {
        id: source.id,
        handle: source.handle,
        category: source.category,
        baselineReliability: source.baselineReliability,
        allowedAssets: source.allowedAssets,
        relevantSectors: source.relevantSectors,
        policyTemplate: source.policyTemplate,
        tone: source.tone
      }
    })
  );

  return hash.digest("hex");
}

export function upsertExtractionCache(entriesByFingerprint) {
  if (!entriesByFingerprint || !Object.keys(entriesByFingerprint).length) {
    return readExtractionCache();
  }

  seedCacheIfNeeded();
  const db = getDatabase();
  const now = new Date().toISOString();
  const upsertStatement = db.prepare(
    `
      INSERT INTO extraction_cache(
        fingerprint,
        prompt_version,
        model,
        post_id,
        source_id,
        cached_at,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET
        prompt_version = excluded.prompt_version,
        model = excluded.model,
        post_id = excluded.post_id,
        source_id = excluded.source_id,
        cached_at = excluded.cached_at,
        payload = excluded.payload
    `
  );

  db.exec("BEGIN");

  try {
    for (const [fingerprint, entry] of Object.entries(entriesByFingerprint)) {
      upsertStatement.run(
        fingerprint,
        String(entry.promptVersion || ""),
        String(entry.model || ""),
        String(entry.postId || ""),
        String(entry.sourceId || ""),
        String(entry.cachedAt || now),
        JSON.stringify(entry)
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return readExtractionCache();
}
