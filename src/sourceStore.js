import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sources as seedSources } from "./data.js";
import { getDatabase, parseJsonColumn, readMetadata, tableHasRows, writeMetadata } from "./database.js";

const LEGACY_STORE_PATH = fileURLToPath(new URL("../data/source-store.json", import.meta.url));
const SOURCE_STORE_VERSION = 2;

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function clampReliability(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0.5;
  }

  return Number(Math.min(0.99, Math.max(0, numericValue)).toFixed(2));
}

export function buildSourceReliability(baselineReliability) {
  const score = clampReliability(baselineReliability);

  if (score >= 0.85) {
    return {
      score,
      tier: "high",
      label: "Reliable",
      operatorGuidance: "Can originate meaningful claims when the wording is operational and specific."
    };
  }

  if (score >= 0.72) {
    return {
      score,
      tier: "solid",
      label: "Reliable",
      operatorGuidance: "Usually worth listening to, but still validate the claimed operating impact."
    };
  }

  if (score >= 0.58) {
    return {
      score,
      tier: "mixed",
      label: "Review carefully",
      operatorGuidance: "Useful as signal input, but should be corroborated before it shapes a decision."
    };
  }

  return {
    score,
    tier: "low",
    label: "Fact-check needed",
    operatorGuidance: "Treat as radar only until the claim is independently verified."
  };
}

function normalizeSource(source, existingSource = {}) {
  const handle = String(source.handle || existingSource.handle || "").trim();
  const name = String(source.name || existingSource.name || handle || "").trim();
  const baselineReliability = clampReliability(
    source.baselineReliability ?? existingSource.baselineReliability ?? 0.6
  );

  return {
    id: String(source.id || existingSource.id || "").trim(),
    handle,
    name,
    category: String(source.category || existingSource.category || "Operator / Custom").trim(),
    baselineReliability,
    reliability: buildSourceReliability(baselineReliability),
    preferredHorizon: String(
      source.preferredHorizon || existingSource.preferredHorizon || "2-7 days"
    ).trim(),
    policyTemplate: String(
      source.policyTemplate || existingSource.policyTemplate || "Custom operator source"
    ).trim(),
    relevantSectors: normalizeStringArray(source.relevantSectors ?? existingSource.relevantSectors),
    allowedAssets: normalizeStringArray(source.allowedAssets ?? existingSource.allowedAssets),
    specialHandling: String(
      source.specialHandling || existingSource.specialHandling || "No special handling rules yet."
    ).trim(),
    tone: String(source.tone || existingSource.tone || "Custom").trim(),
    lastActive: String(source.lastActive || existingSource.lastActive || "").trim()
  };
}

function createDefaultStore() {
  return {
    version: SOURCE_STORE_VERSION,
    updatedAt: new Date().toISOString(),
    sources: seedSources.map((source) => normalizeSource(source))
  };
}

function isValidStore(store) {
  return Boolean(store && Array.isArray(store.sources));
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
    sources: parsedStore.sources.map((source) => normalizeSource(source))
  };
}

function sortSources(sources) {
  return [...sources].sort((left, right) => left.handle.localeCompare(right.handle));
}

function buildSourceId(handle, existingIds) {
  const normalizedHandle = handle
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const baseId = `src-${normalizedHandle || "custom"}`;

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;

  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function seedSourcesIfNeeded() {
  if (tableHasRows("sources")) {
    return;
  }

  const db = getDatabase();
  const legacyStore = readLegacyStore();
  const insertStatement = db.prepare(
    `
      INSERT OR IGNORE INTO sources(id, handle, updated_at, payload)
      VALUES (?, ?, ?, ?)
    `
  );

  db.exec("BEGIN");

  try {
    for (const source of sortSources(legacyStore.sources)) {
      insertStatement.run(
        source.id,
        source.handle,
        legacyStore.updatedAt,
        JSON.stringify(source)
      );
    }

    db.exec("COMMIT");
    writeMetadata("source_store_updated_at", legacyStore.updatedAt || new Date().toISOString());
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function readSourcesFromDatabase() {
  seedSourcesIfNeeded();
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM sources
        ORDER BY handle COLLATE NOCASE ASC
      `
    )
    .all();

  return rows.map((row) => normalizeSource(parseJsonColumn(row.payload, {})));
}

function persistSources(sources, updatedAt) {
  const db = getDatabase();
  const deleteStatement = db.prepare("DELETE FROM sources");
  const insertStatement = db.prepare(
    `
      INSERT INTO sources(id, handle, updated_at, payload)
      VALUES (?, ?, ?, ?)
    `
  );

  db.exec("BEGIN");

  try {
    deleteStatement.run();

    for (const source of sortSources(sources)) {
      insertStatement.run(source.id, source.handle, updatedAt, JSON.stringify(source));
    }

    db.exec("COMMIT");
    writeMetadata("source_store_updated_at", updatedAt);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function readSourceStore() {
  const sources = readSourcesFromDatabase();

  return {
    version: SOURCE_STORE_VERSION,
    updatedAt: readMetadata("source_store_updated_at", new Date().toISOString()),
    sources
  };
}

export function listSources() {
  return readSourceStore().sources;
}

export function createSource(input) {
  const store = readSourceStore();
  const source = normalizeSource(input);

  if (!source.handle || !source.name) {
    throw new Error("Source name and handle are required.");
  }

  const existingIds = new Set(store.sources.map((item) => item.id));
  const existingHandles = new Set(store.sources.map((item) => item.handle.toLowerCase()));

  if (existingHandles.has(source.handle.toLowerCase())) {
    throw new Error("A source with that handle already exists.");
  }

  const nextSource = {
    ...source,
    id: buildSourceId(source.handle, existingIds)
  };
  const updatedAt = new Date().toISOString();

  persistSources([...store.sources, nextSource], updatedAt);
  return nextSource;
}

export function updateSource(sourceId, input) {
  const store = readSourceStore();
  const sourceIndex = store.sources.findIndex((source) => source.id === sourceId);

  if (sourceIndex === -1) {
    throw new Error("Source not found.");
  }

  const currentSource = store.sources[sourceIndex];
  const nextSource = {
    ...normalizeSource(input, currentSource),
    id: currentSource.id
  };

  const conflictingHandle = store.sources.find(
    (source) =>
      source.id !== sourceId && source.handle.toLowerCase() === nextSource.handle.toLowerCase()
  );

  if (conflictingHandle) {
    throw new Error("Another source already uses that handle.");
  }

  const nextSources = [...store.sources];
  nextSources[sourceIndex] = nextSource;
  persistSources(nextSources, new Date().toISOString());
  return nextSource;
}

export function deleteSource(sourceId) {
  const store = readSourceStore();
  const nextSources = store.sources.filter((source) => source.id !== sourceId);

  if (nextSources.length === store.sources.length) {
    throw new Error("Source not found.");
  }

  persistSources(nextSources, new Date().toISOString());
}
