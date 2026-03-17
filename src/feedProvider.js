import { readTweetStore } from "./tweetStore.js";

const FEED_PROVIDER_VERSION = {
  fake: "fake-feed-v1",
  x_api: "x-api-adapter-v0"
};

function normalizeProvider(value) {
  const normalizedValue = String(value || "fake").trim().toLowerCase();
  return normalizedValue === "x-api" ? "x_api" : "fake";
}

export function getFeedProviderConfig() {
  const requestedProvider = normalizeProvider(process.env.FEED_PROVIDER || "fake");
  const hasXCredentials = Boolean(process.env.X_API_BEARER_TOKEN || process.env.X_API_KEY);
  const activeProvider = requestedProvider === "x_api" && hasXCredentials ? "x_api" : "fake";

  return {
    requestedProvider,
    activeProvider,
    hasXCredentials,
    version: FEED_PROVIDER_VERSION[activeProvider]
  };
}

export async function syncFeedProvider({ generatedAt = new Date().toISOString() } = {}) {
  const config = getFeedProviderConfig();

  if (config.activeProvider === "x_api") {
    return {
      ok: true,
      generatedAt,
      requestedProvider: config.requestedProvider,
      activeProvider: config.activeProvider,
      providerVersion: config.version,
      warnings: [
        "The X API adapter scaffold is present, but live fetch wiring is still deferred until credentials are configured and the upstream contract is finalized."
      ]
    };
  }

  const tweetStore = readTweetStore();

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
