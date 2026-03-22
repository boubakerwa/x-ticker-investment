import { readTweetStore } from "./tweetStore.js";
import { syncXApiTimeline } from "./xApiFeedProvider.js";

const FEED_PROVIDER_VERSION = {
  fake: "fake-feed-v1",
  manual: "manual-inbox-v1",
  x_api: "x-api-adapter-v1"
};

function normalizeProvider(value) {
  const normalizedValue = String(value || "fake").trim().toLowerCase();

  if (normalizedValue === "x-api") {
    return "x_api";
  }

  if (normalizedValue === "manual") {
    return "manual";
  }

  return "fake";
}

export function getFeedProviderConfig() {
  const requestedProvider = normalizeProvider(process.env.FEED_PROVIDER || "fake");
  const tweetStore = readTweetStore();
  const hasXCredentials = Boolean(process.env.X_API_BEARER_TOKEN);
  const hasManualFeed = String(tweetStore.mode || "").startsWith("manual");
  const activeProvider =
    requestedProvider === "x_api" && hasXCredentials
      ? "x_api"
      : requestedProvider === "manual" || hasManualFeed
        ? "manual"
        : "fake";

  return {
    requestedProvider,
    activeProvider,
    hasXCredentials,
    hasManualFeed,
    version: FEED_PROVIDER_VERSION[activeProvider]
  };
}

export async function syncFeedProvider({ generatedAt = new Date().toISOString(), sources = [] } = {}) {
  const config = getFeedProviderConfig();

  if (config.activeProvider === "x_api") {
    return syncXApiTimeline({
      sources,
      generatedAt
    });
  }

  const tweetStore = readTweetStore();

  if (config.activeProvider === "manual") {
    return {
      ok: true,
      generatedAt,
      requestedProvider: config.requestedProvider,
      activeProvider: config.activeProvider,
      providerVersion: config.version,
      feedMode: tweetStore.mode,
      seededAt: tweetStore.seededAt,
      fetchedCount: tweetStore.posts.length,
      warnings:
        config.requestedProvider !== "manual"
          ? ["A saved manual inbox feed is active. Set FEED_PROVIDER=manual to make that explicit."]
          : []
    };
  }

  return {
    ok: true,
    generatedAt,
    requestedProvider: config.requestedProvider,
    activeProvider: config.activeProvider,
    providerVersion: config.version,
    feedMode: tweetStore.mode,
    seededAt: tweetStore.seededAt,
    fetchedCount: tweetStore.posts.length,
    warnings:
      config.requestedProvider === "x_api" && !config.hasXCredentials
        ? ["Falling back to the fake feed because X API credentials are not configured yet."]
        : []
  };
}
