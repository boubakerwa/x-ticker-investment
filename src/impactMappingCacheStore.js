import { createHash } from "node:crypto";
import { getDatabase, parseJsonColumn } from "./database.js";

const CACHE_VERSION = 1;

export function readImpactMappingCache() {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT fingerprint, payload, cached_at
        FROM impact_mapping_cache
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

export function buildImpactMappingFingerprint({
  promptVersion,
  model,
  post,
  source,
  candidateUniverse
}) {
  const hash = createHash("sha1");

  hash.update(
    JSON.stringify({
      promptVersion,
      model,
      post: {
        sourceId: post.sourceId,
        body: post.body,
        clusterId: post.clusterId,
        claimType: post.claimType,
        direction: post.direction,
        actionable: post.actionable,
        confidence: post.confidence,
        mappedAssets: post.mappedAssets,
        assetMapping: post.assetMapping
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
      },
      candidateUniverse: (candidateUniverse || []).map((asset) => ({
        ticker: asset.ticker,
        name: asset.name,
        bucket: asset.bucket,
        thesis: asset.thesis,
        riskFlag: asset.riskFlag,
        isTracked: Boolean(asset.isTracked),
        isHolding: Boolean(asset.isHolding),
        isWatchlist: Boolean(asset.isWatchlist),
        trackingLabel: asset.trackingLabel,
        personalCategory: asset.personalCategory,
        personalNotes: asset.personalNotes
      }))
    })
  );

  return hash.digest("hex");
}

export function upsertImpactMappingCache(entriesByFingerprint) {
  if (!entriesByFingerprint || !Object.keys(entriesByFingerprint).length) {
    return readImpactMappingCache();
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  const upsertStatement = db.prepare(
    `
      INSERT INTO impact_mapping_cache(
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

  return readImpactMappingCache();
}
