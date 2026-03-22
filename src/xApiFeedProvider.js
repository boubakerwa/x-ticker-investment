import { replaceTweetStore } from "./tweetStore.js";

const DEFAULT_X_API_BASE_URL = "https://api.x.com/2";
const X_API_PROVIDER_VERSION = "x-api-adapter-v1";

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeHandle(value) {
  return String(value || "").trim().replace(/^@+/, "");
}

function clampMaxResults(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 8;
  }

  return Math.max(5, Math.min(20, Math.round(numericValue)));
}

export function getXApiConfig() {
  return {
    bearerToken: String(process.env.X_API_BEARER_TOKEN || "").trim(),
    apiKey: String(process.env.X_API_KEY || "").trim(),
    baseUrl: trimTrailingSlash(process.env.X_API_BASE_URL || DEFAULT_X_API_BASE_URL),
    maxResultsPerSource: clampMaxResults(process.env.X_API_MAX_RESULTS_PER_SOURCE || 8)
  };
}

async function requestJson(url, config, errorContext) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.bearerToken}`,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = payload?.detail || payload?.title || payload?.error || `HTTP ${response.status}`;
    throw new Error(`${errorContext}: ${detail}`);
  }

  return payload;
}

async function lookupUsersByHandles(handles, config) {
  const uniqueHandles = [...new Set(handles.map((handle) => normalizeHandle(handle)).filter(Boolean))];
  const usersByHandle = new Map();

  for (let index = 0; index < uniqueHandles.length; index += 100) {
    const batch = uniqueHandles.slice(index, index + 100);
    const searchParams = new URLSearchParams({
      usernames: batch.join(","),
      "user.fields": "name,username,verified,most_recent_tweet_id"
    });
    const payload = await requestJson(
      `${config.baseUrl}/users/by?${searchParams.toString()}`,
      config,
      "Failed to resolve X usernames"
    );

    for (const user of payload.data || []) {
      usersByHandle.set(String(user.username || "").toLowerCase(), user);
    }
  }

  return usersByHandle;
}

async function fetchRecentPostsForUser(userId, config) {
  const searchParams = new URLSearchParams({
    max_results: String(config.maxResultsPerSource),
    exclude: "replies,retweets",
    "tweet.fields": "created_at,lang,public_metrics"
  });
  const payload = await requestJson(
    `${config.baseUrl}/users/${encodeURIComponent(userId)}/tweets?${searchParams.toString()}`,
    config,
    `Failed to fetch recent posts for X user ${userId}`
  );

  return Array.isArray(payload.data) ? payload.data : [];
}

export async function syncXApiTimeline({ sources, generatedAt = new Date().toISOString() }) {
  const config = getXApiConfig();

  if (!config.bearerToken) {
    throw new Error("X_API_BEARER_TOKEN is required before the live X feed can sync.");
  }

  const eligibleSources = (sources || []).filter((source) => normalizeHandle(source.handle));

  if (!eligibleSources.length) {
    throw new Error("No sources with valid X handles are configured.");
  }

  const usersByHandle = await lookupUsersByHandles(
    eligibleSources.map((source) => source.handle),
    config
  );
  const warnings = [];
  const posts = [];

  for (const source of eligibleSources) {
    const normalizedHandle = normalizeHandle(source.handle).toLowerCase();
    const user = usersByHandle.get(normalizedHandle);

    if (!user) {
      warnings.push(`No X user was resolved for ${source.handle}.`);
      continue;
    }

    const recentPosts = await fetchRecentPostsForUser(user.id, config);

    if (!recentPosts.length) {
      warnings.push(`No recent posts were returned for ${source.handle}.`);
      continue;
    }

    for (const post of recentPosts) {
      posts.push({
        id: String(post.id || "").trim(),
        sourceId: source.id,
        createdAt: post.created_at || generatedAt,
        body: String(post.text || "").trim(),
        actionable: false,
        claimType: "Operator commentary",
        direction: "Mixed",
        explicitness: "Explicit",
        themes: [],
        confidence: 0.62,
        mappedAssets: [],
        clusterId: "cluster-enterprise-ai"
      });
    }
  }

  if (!posts.length) {
    throw new Error("The X API returned no recent posts for the configured source list.");
  }

  const tweetStore = replaceTweetStore({
    mode: "x-api",
    seededAt: generatedAt,
    posts
  });

  return {
    ok: true,
    generatedAt,
    requestedProvider: "x_api",
    activeProvider: "x_api",
    providerVersion: X_API_PROVIDER_VERSION,
    feedMode: tweetStore.mode,
    seededAt: tweetStore.seededAt,
    fetchedCount: tweetStore.posts.length,
    warnings
  };
}
