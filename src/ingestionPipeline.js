import { createHash } from "node:crypto";
import { formatBerlinTimestamp } from "./fakeTweetGenerator.js";

const INGESTION_CONTRACT_VERSION = "raw-post-v1";
const NORMALIZED_POST_VERSION = "normalized-post-v1";

function buildBodyHash(body) {
  return createHash("sha1").update(String(body || "").trim().toLowerCase()).digest("hex");
}

function buildDedupeKey(post) {
  return `${post.sourceId}:${post.createdAt}:${buildBodyHash(post.body)}`;
}

function normalizeRawPost(post, source, { fetchedAt, feedMode }) {
  const body = String(post.body || "").trim();
  const sourceSnapshot = {
    id: source?.id || post.sourceId,
    handle: source?.handle || "",
    category: source?.category || "Operator / Custom",
    baselineReliability: source?.baselineReliability ?? 0.6,
    allowedAssets: source?.allowedAssets || [],
    relevantSectors: source?.relevantSectors || []
  };

  return {
    ingestionId: `ing-${post.id}`,
    externalId: post.id,
    sourceId: post.sourceId,
    createdAt: post.createdAt,
    fetchedAt,
    feedMode,
    timestamp: formatBerlinTimestamp(post.createdAt),
    body,
    rawHash: buildBodyHash(body),
    dedupeKey: buildDedupeKey(post),
    contractVersion: INGESTION_CONTRACT_VERSION,
    sourceSnapshot
  };
}

function normalizeEngineInput(rawPost) {
  return {
    id: rawPost.externalId,
    sourceId: rawPost.sourceId,
    createdAt: rawPost.createdAt,
    timestamp: rawPost.timestamp,
    body: rawPost.body,
    rawHash: rawPost.rawHash,
    ingestion: {
      ingestionId: rawPost.ingestionId,
      contractVersion: NORMALIZED_POST_VERSION,
      fetchedAt: rawPost.fetchedAt,
      dedupeKey: rawPost.dedupeKey,
      feedMode: rawPost.feedMode
    }
  };
}

export function buildIngestionSnapshot({ tweetStore, sources }) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const rawPosts = tweetStore.posts.map((post) =>
    normalizeRawPost(post, sourceMap.get(post.sourceId), {
      fetchedAt: tweetStore.seededAt,
      feedMode: tweetStore.mode
    })
  );
  const seenDedupeKeys = new Set();
  const dedupedRawPosts = [];

  for (const rawPost of rawPosts) {
    if (seenDedupeKeys.has(rawPost.dedupeKey)) {
      continue;
    }

    seenDedupeKeys.add(rawPost.dedupeKey);
    dedupedRawPosts.push(rawPost);
  }

  const normalizedPosts = dedupedRawPosts.map((rawPost) => normalizeEngineInput(rawPost));
  const bySource = dedupedRawPosts.reduce((accumulator, rawPost) => {
    accumulator[rawPost.sourceId] = (accumulator[rawPost.sourceId] || 0) + 1;
    return accumulator;
  }, {});
  const watermarks = [...new Set(dedupedRawPosts.map((rawPost) => rawPost.sourceId))]
    .map((sourceId) => {
      const latestPost = dedupedRawPosts
        .filter((rawPost) => rawPost.sourceId === sourceId)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];

      return {
        sourceId,
        newestPostAt: latestPost?.createdAt || ""
      };
    })
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

  return {
    rawPosts,
    normalizedPosts,
    summary: {
      contractVersion: INGESTION_CONTRACT_VERSION,
      normalizedVersion: NORMALIZED_POST_VERSION,
      feedMode: tweetStore.mode,
      fetchedAt: tweetStore.seededAt,
      fetchedCount: rawPosts.length,
      dedupedCount: dedupedRawPosts.length,
      duplicateCount: rawPosts.length - dedupedRawPosts.length,
      newestPostAt: dedupedRawPosts[0]?.createdAt || "",
      oldestPostAt: dedupedRawPosts.at(-1)?.createdAt || "",
      sourcesCovered: Object.keys(bySource).length,
      bySource: Object.entries(bySource)
        .map(([sourceId, count]) => ({ sourceId, count }))
        .sort((left, right) => right.count - left.count),
      watermarks
    }
  };
}
