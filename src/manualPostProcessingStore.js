import { createHash } from "node:crypto";
import { getDatabase } from "./database.js";
import { readTweetStore } from "./tweetStore.js";

const DEFAULT_MAX_POST_AGE_HOURS = 24;

function clampPositiveHours(value, fallbackValue = DEFAULT_MAX_POST_AGE_HOURS) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallbackValue;
  }

  return Math.max(1, Math.round(numericValue));
}

function isManualStoreMode(mode) {
  return String(mode || "").startsWith("manual");
}

function buildPostFingerprint(post) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        sourceId: String(post?.sourceId || "").trim(),
        createdAt: String(post?.createdAt || "").trim(),
        body: String(post?.body || "").trim()
      })
    )
    .digest("hex");
}

function getProcessingMapByPostIds(postIds = []) {
  const normalizedIds = [...new Set(postIds.map((postId) => String(postId || "").trim()).filter(Boolean))];

  if (!normalizedIds.length) {
    return new Map();
  }

  const placeholders = normalizedIds.map(() => "?").join(", ");
  const rows = getDatabase()
    .prepare(
      `
        SELECT post_id, fingerprint, processed_at, updated_at
        FROM manual_post_processing
        WHERE post_id IN (${placeholders})
      `
    )
    .all(...normalizedIds);

  return new Map(
    rows.map((row) => [
      row.post_id,
      {
        postId: row.post_id,
        fingerprint: row.fingerprint,
        processedAt: row.processed_at,
        updatedAt: row.updated_at
      }
    ])
  );
}

function isPostWithinMaxAge(post, maxAgeHours, nowMs) {
  const createdAtMs = new Date(post?.createdAt || "").getTime();

  if (!Number.isFinite(createdAtMs) || createdAtMs > nowMs) {
    return false;
  }

  return createdAtMs >= nowMs - maxAgeHours * 60 * 60 * 1000;
}

export function getManualPostProcessingConfig() {
  return {
    maxPostAgeHours: clampPositiveHours(
      process.env.MANUAL_FEED_CRON_MAX_POST_AGE_HOURS || DEFAULT_MAX_POST_AGE_HOURS,
      DEFAULT_MAX_POST_AGE_HOURS
    )
  };
}

export function listEligibleManualPosts({
  tweetStore = readTweetStore(),
  maxPostAgeHours = getManualPostProcessingConfig().maxPostAgeHours,
  now = new Date().toISOString()
} = {}) {
  const nowMs = new Date(now).getTime();
  const normalizedMaxPostAgeHours = clampPositiveHours(maxPostAgeHours);
  const manualModeActive = isManualStoreMode(tweetStore.mode);
  const eligiblePosts = manualModeActive
    ? tweetStore.posts.filter((post) => isPostWithinMaxAge(post, normalizedMaxPostAgeHours, nowMs))
    : [];

  return {
    manualModeActive,
    maxPostAgeHours: normalizedMaxPostAgeHours,
    now,
    posts: eligiblePosts
  };
}

export function listPendingManualPosts(options = {}) {
  const eligible = listEligibleManualPosts(options);

  if (!eligible.manualModeActive || !eligible.posts.length) {
    return {
      ...eligible,
      pendingPosts: [],
      eligibleCount: eligible.posts.length,
      pendingCount: 0
    };
  }

  const processingMap = getProcessingMapByPostIds(eligible.posts.map((post) => post.id));
  const pendingPosts = eligible.posts.filter((post) => {
    const record = processingMap.get(post.id);
    const fingerprint = buildPostFingerprint(post);

    return !record || record.fingerprint !== fingerprint;
  });

  return {
    ...eligible,
    pendingPosts,
    eligibleCount: eligible.posts.length,
    pendingCount: pendingPosts.length
  };
}

export function markManualPostsProcessed(
  posts,
  { processedAt = new Date().toISOString(), updatedAt = processedAt } = {}
) {
  const parsedPosts = Array.isArray(posts) ? posts : [];

  if (!parsedPosts.length) {
    return 0;
  }

  const db = getDatabase();
  const statement = db.prepare(
    `
      INSERT INTO manual_post_processing(post_id, fingerprint, processed_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(post_id) DO UPDATE SET
        fingerprint = excluded.fingerprint,
        processed_at = excluded.processed_at,
        updated_at = excluded.updated_at
    `
  );

  db.exec("BEGIN");

  try {
    for (const post of parsedPosts) {
      const postId = String(post?.id || "").trim();

      if (!postId) {
        continue;
      }

      statement.run(postId, buildPostFingerprint(post), processedAt, updatedAt);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return parsedPosts.length;
}
