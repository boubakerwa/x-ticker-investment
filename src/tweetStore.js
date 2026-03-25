import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  getDatabase,
  parseJsonColumn,
  readMetadata,
  tableHasRows,
  writeMetadataEntries
} from "./database.js";
import { formatBerlinTimestamp, generateFakeTweets } from "./fakeTweetGenerator.js";

const LEGACY_STORE_PATH = fileURLToPath(new URL("../data/tweet-store.json", import.meta.url));
const TARGET_FAKE_TWEET_COUNT = 140;
const TWEET_STORE_VERSION = 2;
const MANUAL_FEED_MODE = "manual-inbox";

function isValidStore(store) {
  return Boolean(store && Array.isArray(store.posts));
}

function sortPostsDescending(posts) {
  return [...posts].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

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

function clampConfidence(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0.6;
  }

  return Number(Math.min(0.99, Math.max(0, numericValue)).toFixed(2));
}

function normalizeCreatedAt(value, fallbackValue = new Date().toISOString()) {
  const candidate = value ? new Date(value) : new Date(fallbackValue);

  if (Number.isNaN(candidate.getTime())) {
    return new Date(fallbackValue).toISOString();
  }

  return candidate.toISOString();
}

function normalizePost(post, existingPost = {}) {
  const createdAt = normalizeCreatedAt(post.createdAt ?? existingPost.createdAt);

  return {
    id: String(post.id || existingPost.id || "").trim(),
    sourceId: String(post.sourceId || existingPost.sourceId || "").trim(),
    createdAt,
    timestamp: formatBerlinTimestamp(createdAt),
    body: String(post.body || existingPost.body || "").trim(),
    actionable: Boolean(
      typeof post.actionable === "boolean" ? post.actionable : existingPost.actionable ?? false
    ),
    claimType: String(post.claimType || existingPost.claimType || "Operator note").trim(),
    direction: String(post.direction || existingPost.direction || "Mixed").trim(),
    explicitness: String(post.explicitness || existingPost.explicitness || "Interpretive").trim(),
    themes: normalizeStringArray(post.themes ?? existingPost.themes),
    confidence: clampConfidence(post.confidence ?? existingPost.confidence ?? 0.6),
    mappedAssets: normalizeStringArray(post.mappedAssets ?? existingPost.mappedAssets),
    clusterId: String(post.clusterId || existingPost.clusterId || "cluster-enterprise-ai").trim()
  };
}

function buildPostId(existingIds) {
  const baseId = "post-manual";
  let suffix = Date.now();

  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function readLegacyStore() {
  if (!existsSync(LEGACY_STORE_PATH)) {
    const seededAt = new Date().toISOString();
    return {
      version: TWEET_STORE_VERSION,
      mode: "fake-api",
      seededAt,
      posts: generateFakeTweets({
        count: TARGET_FAKE_TWEET_COUNT,
        snapshotTime: seededAt
      })
    };
  }

  const parsedStore = parseJsonColumn(readFileSync(LEGACY_STORE_PATH, "utf8"), null);

  if (!isValidStore(parsedStore)) {
    const seededAt = new Date().toISOString();
    return {
      version: TWEET_STORE_VERSION,
      mode: "fake-api",
      seededAt,
      posts: generateFakeTweets({
        count: TARGET_FAKE_TWEET_COUNT,
        snapshotTime: seededAt
      })
    };
  }

  return {
    version: TWEET_STORE_VERSION,
    mode: String(parsedStore.mode || "fake-api"),
    seededAt: String(parsedStore.seededAt || new Date().toISOString()),
    posts: sortPostsDescending(parsedStore.posts.map((post) => normalizePost(post)))
  };
}

function seedTweetsIfNeeded() {
  if (tableHasRows("tweets")) {
    return;
  }

  const legacyStore = readLegacyStore();
  const db = getDatabase();
  const insertStatement = db.prepare(
    `
      INSERT OR IGNORE INTO tweets(id, source_id, created_at, payload)
      VALUES (?, ?, ?, ?)
    `
  );

  db.exec("BEGIN");

  try {
    for (const post of sortPostsDescending(legacyStore.posts)) {
      insertStatement.run(post.id, post.sourceId, post.createdAt, JSON.stringify(post));
    }

    db.exec("COMMIT");
    writeMetadataEntries({
      tweet_store_mode: legacyStore.mode,
      tweet_store_seeded_at: legacyStore.seededAt
    });
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function persistTweetStore({ mode, seededAt, posts }) {
  const db = getDatabase();
  const insertStatement = db.prepare(
    `
      INSERT INTO tweets(id, source_id, created_at, payload)
      VALUES (?, ?, ?, ?)
    `
  );

  db.exec("BEGIN");

  try {
    db.prepare("DELETE FROM tweets").run();

    for (const post of sortPostsDescending(posts)) {
      insertStatement.run(post.id, post.sourceId, post.createdAt, JSON.stringify(post));
    }

    db.exec("COMMIT");
    writeMetadataEntries({
      tweet_store_mode: mode,
      tweet_store_seeded_at: seededAt
    });
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function buildImportedCreatedAt(index, seededAt) {
  const baseTime = new Date(seededAt).getTime();

  if (!Number.isFinite(baseTime)) {
    return new Date().toISOString();
  }

  return new Date(baseTime - index * 1000).toISOString();
}

function readTweetsFromDatabase() {
  seedTweetsIfNeeded();
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM tweets
        ORDER BY created_at DESC
      `
    )
    .all();

  return rows.map((row) => normalizePost(parseJsonColumn(row.payload, {})));
}

export function reseedTweetStore(count = TARGET_FAKE_TWEET_COUNT) {
  const seededAt = new Date().toISOString();
  const posts = generateFakeTweets({
    count,
    snapshotTime: seededAt
  }).map((post) => normalizePost(post));

  persistTweetStore({
    mode: "fake-api",
    seededAt,
    posts
  });

  return {
    version: TWEET_STORE_VERSION,
    mode: "fake-api",
    seededAt,
    posts
  };
}

export function replaceTweetStore({ mode = "manual-sync", seededAt = new Date().toISOString(), posts = [] }) {
  const normalizedPosts = sortPostsDescending(posts.map((post) => normalizePost(post)));

  persistTweetStore({
    mode,
    seededAt,
    posts: normalizedPosts
  });

  return {
    version: TWEET_STORE_VERSION,
    mode,
    seededAt,
    posts: normalizedPosts
  };
}

export function importAttributedManualPosts({
  posts,
  replaceExisting = true,
  seededAt = new Date().toISOString()
}) {
  const parsedPosts = Array.isArray(posts) ? posts : [];

  if (!parsedPosts.length) {
    throw new Error("At least one manual post is required.");
  }

  const currentStore = readTweetStore();
  const basePosts = replaceExisting ? [] : currentStore.posts;
  const existingIds = new Set(basePosts.map((post) => post.id));
  const importedPosts = parsedPosts.map((post, index) => {
    const sourceId = String(post.sourceId || "").trim();
    const body = String(post.body || "").trim();

    if (!sourceId) {
      throw new Error("Each manual post must include a sourceId.");
    }

    if (!body) {
      throw new Error("Each manual post must include body text.");
    }

    const createdAt = normalizeCreatedAt(post.createdAt, buildImportedCreatedAt(index, seededAt));
    const id = String(post.id || "").trim() || buildPostId(existingIds);

    existingIds.add(id);

    return normalizePost({
      id,
      sourceId,
      createdAt,
      body,
      actionable: Boolean(post.actionable),
      claimType: String(post.claimType || "Operator commentary").trim(),
      direction: String(post.direction || "Mixed").trim(),
      explicitness: String(post.explicitness || "Explicit").trim(),
      themes: normalizeStringArray(post.themes),
      confidence: clampConfidence(post.confidence ?? 0.62),
      mappedAssets: normalizeStringArray(post.mappedAssets),
      clusterId: String(post.clusterId || "cluster-enterprise-ai").trim()
    });
  });

  const nextStore = replaceTweetStore({
    mode: replaceExisting ? MANUAL_FEED_MODE : "manual-hybrid",
    seededAt,
    posts: [...importedPosts, ...basePosts]
  });

  return {
    ...nextStore,
    importedCount: importedPosts.length
  };
}

export function importManualPosts({
  sourceId,
  posts,
  replaceExisting = true,
  seededAt = new Date().toISOString()
}) {
  if (!sourceId) {
    throw new Error("A sourceId is required for manual imports.");
  }

  return importAttributedManualPosts({
    replaceExisting,
    seededAt,
    posts: (Array.isArray(posts) ? posts : []).map((post) => ({
      ...post,
      sourceId
    }))
  });
}

export function readTweetStore() {
  const posts = readTweetsFromDatabase();

  return {
    version: TWEET_STORE_VERSION,
    mode: readMetadata("tweet_store_mode", "fake-api"),
    seededAt: readMetadata("tweet_store_seeded_at", new Date().toISOString()),
    posts
  };
}

export function getAnalysedPosts({ days = 3, limit = TARGET_FAKE_TWEET_COUNT } = {}) {
  const store = readTweetStore();
  const snapshotTime = new Date(store.seededAt).getTime();
  const cutoffTime = snapshotTime - days * 24 * 60 * 60 * 1000;
  const posts = sortPostsDescending(store.posts)
    .filter((post) => {
      const postTime = new Date(post.createdAt).getTime();
      return Number.isFinite(postTime) && postTime >= cutoffTime && postTime <= snapshotTime;
    })
    .slice(0, limit);

  return {
    mode: store.mode,
    seededAt: store.seededAt,
    count: posts.length,
    posts
  };
}

export function getTweetStoreStatus() {
  const store = readTweetStore();
  const posts = sortPostsDescending(store.posts);
  const bySourceMap = new Map();
  const byClusterMap = new Map();

  for (const post of posts) {
    bySourceMap.set(post.sourceId, (bySourceMap.get(post.sourceId) || 0) + 1);
    byClusterMap.set(post.clusterId, (byClusterMap.get(post.clusterId) || 0) + 1);
  }

  return {
    mode: store.mode,
    seededAt: store.seededAt,
    postCount: posts.length,
    newestPostAt: posts[0]?.createdAt || "",
    oldestPostAt: posts.at(-1)?.createdAt || "",
    sourcesCovered: bySourceMap.size,
    clustersCovered: byClusterMap.size,
    bySource: [...bySourceMap.entries()]
      .map(([sourceId, count]) => ({ sourceId, count }))
      .sort((left, right) => right.count - left.count),
    byCluster: [...byClusterMap.entries()]
      .map(([clusterId, count]) => ({ clusterId, count }))
      .sort((left, right) => right.count - left.count)
  };
}

export function hasTweetsForSource(sourceId) {
  return readTweetStore().posts.some((post) => post.sourceId === sourceId);
}

export function createTweet(input) {
  const store = readTweetStore();
  const post = normalizePost(input);

  if (!post.sourceId || !post.body) {
    throw new Error("Tweet source and body are required.");
  }

  const nextPost = {
    ...post,
    id: buildPostId(new Set(store.posts.map((item) => item.id)))
  };
  const seededAt = new Date().toISOString();

  persistTweetStore({
    mode: store.mode,
    seededAt,
    posts: [...store.posts, nextPost]
  });

  return nextPost;
}

export function updateTweet(postId, input) {
  const store = readTweetStore();
  const postIndex = store.posts.findIndex((post) => post.id === postId);

  if (postIndex === -1) {
    throw new Error("Tweet not found.");
  }

  const currentPost = store.posts[postIndex];
  const nextPost = {
    ...normalizePost(input, currentPost),
    id: currentPost.id
  };
  const nextPosts = [...store.posts];
  nextPosts[postIndex] = nextPost;

  persistTweetStore({
    mode: store.mode,
    seededAt: new Date().toISOString(),
    posts: nextPosts
  });

  return nextPost;
}

export function deleteTweet(postId) {
  const store = readTweetStore();
  const nextPosts = store.posts.filter((post) => post.id !== postId);

  if (nextPosts.length === store.posts.length) {
    throw new Error("Tweet not found.");
  }

  persistTweetStore({
    mode: store.mode,
    seededAt: new Date().toISOString(),
    posts: nextPosts
  });
}
