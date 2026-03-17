import { getAppData } from "./data.js";
import { runAgenticEngine } from "./agenticEngine.js";
import { syncFeedProvider } from "./feedProvider.js";
import { buildIngestionSnapshot } from "./ingestionPipeline.js";
import {
  buildMarketSnapshot,
  getMarketProviderConfig,
  getMarketProviderVersion
} from "./marketDataProvider.js";
import { getClaimExtractorConfig } from "./modelClaimExtractor.js";
import {
  getLatestPipelineSnapshot,
  isPipelineSnapshotCurrent,
  persistPipelineRun
} from "./pipelineStore.js";
import { readSourceStore } from "./sourceStore.js";
import { readTweetStore } from "./tweetStore.js";

function buildStoreStatus({ tweetStore, analysedPosts, runtimeAnalysis }) {
  const bySourceMap = new Map();
  const byClusterMap = new Map();

  for (const post of analysedPosts) {
    bySourceMap.set(post.sourceId, (bySourceMap.get(post.sourceId) || 0) + 1);
    byClusterMap.set(post.clusterId, (byClusterMap.get(post.clusterId) || 0) + 1);
  }

  return {
    mode: tweetStore.mode,
    seededAt: tweetStore.seededAt,
    postCount: analysedPosts.length,
    newestPostAt: analysedPosts[0]?.createdAt || "",
    oldestPostAt: analysedPosts.at(-1)?.createdAt || "",
    sourcesCovered: bySourceMap.size,
    clustersCovered: byClusterMap.size,
    bySource: [...bySourceMap.entries()]
      .map(([sourceId, count]) => ({ sourceId, count }))
      .sort((left, right) => right.count - left.count),
    byCluster: [...byClusterMap.entries()]
      .map(([clusterId, count]) => ({ clusterId, count }))
      .sort((left, right) => right.count - left.count),
    engineMode: runtimeAnalysis.mode,
    extractorMode: runtimeAnalysis.summary.extractorMode,
    extractorModel: runtimeAnalysis.summary.extractorModel,
    actionableCount: runtimeAnalysis.summary.actionableCount,
    decisionCount: runtimeAnalysis.summary.decisionCount,
    vetoCount: runtimeAnalysis.summary.vetoCount
  };
}

function buildRunId() {
  return `run-${Date.now()}`;
}

function buildDependencyKey({
  tweetStore,
  sourceStore,
  extractorConfig,
  marketConfig,
  feedSyncResult
}) {
  return [
    tweetStore.seededAt,
    sourceStore.updatedAt,
    feedSyncResult.activeProvider,
    feedSyncResult.providerVersion,
    extractorConfig.requestedMode,
    extractorConfig.model,
    marketConfig.requestedProvider,
    getMarketProviderVersion()
  ].join(":");
}

function buildBaseSnapshot({
  runId,
  dependencyKey,
  generatedAt,
  tweetStore,
  sourceStore,
  feedSyncResult,
  ingestionSnapshot,
  marketSnapshot,
  runtimeAnalysis
}) {
  const appData = getAppData({
    posts: runtimeAnalysis.posts,
    sources: sourceStore.sources,
    clusters: runtimeAnalysis.clusters,
    decisions: runtimeAnalysis.decisions,
    vetoedSignals: runtimeAnalysis.vetoedSignals,
    generatedAt,
    snapshotLabel: "Persisted pipeline snapshot",
    tweetFeedMode: tweetStore.mode,
    metadataExtras: {
      engineMode: runtimeAnalysis.mode,
      extractorMode: runtimeAnalysis.summary.extractorMode,
      extractorModel: runtimeAnalysis.summary.extractorModel,
      actionableCount: runtimeAnalysis.summary.actionableCount,
      clusterCount: runtimeAnalysis.summary.clusterCount,
      decisionCount: runtimeAnalysis.summary.decisionCount,
      vetoCount: runtimeAnalysis.summary.vetoCount,
      pipelineRunId: runId,
      pipelineDependencyKey: dependencyKey,
      feedGeneratedAt: tweetStore.seededAt,
      feedProvider: feedSyncResult.providerVersion,
      marketProvider: marketSnapshot.providerVersion
    },
    engine: runtimeAnalysis,
    ingestion: ingestionSnapshot.summary,
    market: marketSnapshot
  });
  const storeStatus = buildStoreStatus({
    tweetStore,
    analysedPosts: runtimeAnalysis.posts,
    runtimeAnalysis
  });

  return {
    runId,
    dependencyKey,
    generatedAt,
    appData,
    storeStatus
  };
}

export async function runPipeline({
  trigger = "manual",
  reason = ""
} = {}) {
  const generatedAt = new Date().toISOString();
  const feedSyncResult = await syncFeedProvider({
    generatedAt
  });
  const tweetStore = readTweetStore();
  const sourceStore = readSourceStore();
  const extractorConfig = getClaimExtractorConfig();
  const marketConfig = getMarketProviderConfig();
  const dependencyKey = buildDependencyKey({
    tweetStore,
    sourceStore,
    extractorConfig,
    marketConfig,
    feedSyncResult
  });
  const ingestionSnapshot = buildIngestionSnapshot({
    tweetStore,
    sources: sourceStore.sources
  });
  const marketSnapshot = await buildMarketSnapshot({
    generatedAt
  });
  const runtimeAnalysis = await runAgenticEngine({
    posts: ingestionSnapshot.normalizedPosts,
    sources: sourceStore.sources,
    generatedAt,
    marketSnapshot
  });
  const runId = buildRunId();
  const snapshot = buildBaseSnapshot({
    runId,
    dependencyKey,
    generatedAt,
    tweetStore,
    sourceStore,
    feedSyncResult,
    ingestionSnapshot,
    marketSnapshot,
    runtimeAnalysis
  });
  const runRecord = {
    id: runId,
    dependencyKey,
    generatedAt,
    trigger,
    reason,
    sourceFeed: {
      provider: feedSyncResult.activeProvider,
      providerVersion: feedSyncResult.providerVersion,
      warnings: feedSyncResult.warnings || [],
      mode: tweetStore.mode,
      seededAt: tweetStore.seededAt,
      postCount: tweetStore.posts.length
    },
    sourceRegistry: {
      updatedAt: sourceStore.updatedAt,
      count: sourceStore.sources.length
    },
    ingestion: ingestionSnapshot,
    market: marketSnapshot,
    extractor: runtimeAnalysis.extractor,
    summary: runtimeAnalysis.summary,
    posts: runtimeAnalysis.posts,
    clusters: runtimeAnalysis.clusters,
    decisions: runtimeAnalysis.decisions,
    vetoedSignals: runtimeAnalysis.vetoedSignals,
    snapshot
  };

  persistPipelineRun(runRecord);
  return runRecord;
}

export async function ensureLatestPipelineRun({ trigger = "startup", force = false } = {}) {
  const generatedAt = new Date().toISOString();
  const feedSyncResult = await syncFeedProvider({
    generatedAt
  });
  const tweetStore = readTweetStore();
  const sourceStore = readSourceStore();
  const extractorConfig = getClaimExtractorConfig();
  const marketConfig = getMarketProviderConfig();
  const dependencyKey = buildDependencyKey({
    tweetStore,
    sourceStore,
    extractorConfig,
    marketConfig,
    feedSyncResult
  });

  if (!force && isPipelineSnapshotCurrent(dependencyKey)) {
    return {
      run: null,
      snapshot: getLatestPipelineSnapshot(),
      dependencyKey,
      reused: true
    };
  }

  const run = await runPipeline({
    trigger
  });

  return {
    run,
    snapshot: run.snapshot,
    dependencyKey,
    reused: false
  };
}
