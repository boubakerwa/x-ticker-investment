import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHeuristicPostAnalysis,
  buildNormalizedPostAnalysis
} from "./src/agenticEngine.js";
import { getBackgroundPipelineStatus, startBackgroundPipelineRunner } from "./src/backgroundPipelineRunner.js";
import { runExtractionEval } from "./src/evalHarness.js";
import { getEvalRun, getLatestEvalRun, listEvalRuns } from "./src/evalStore.js";
import { buildClaimExtractionReplay } from "./src/modelClaimExtractor.js";
import { ensureLatestPipelineRun, runPipeline } from "./src/pipelineRunner.js";
import {
  getLatestPipelineSnapshot,
  getPipelineRun,
  listDecisionHistory,
  listPipelineRuns
} from "./src/pipelineStore.js";
import { hasTweetsForSource, readTweetStore, reseedTweetStore } from "./src/tweetStore.js";
import {
  createSource,
  deleteSource,
  listSources,
  readSourceStore,
  updateSource
} from "./src/sourceStore.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

let bootstrapPromise = null;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, {
    ok: false,
    error: message
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;
    });

    request.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (_error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    request.on("error", reject);
  });
}

function resolvePath(urlPath) {
  const cleanPath = urlPath === "/" ? "/index.html" : urlPath;
  const safePath = normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  return join(root, safePath);
}

function filterAnalysedPosts(posts, generatedAt, { days = 3, limit = 100 } = {}) {
  const snapshotTime = new Date(generatedAt).getTime();
  const cutoffTime = snapshotTime - days * 24 * 60 * 60 * 1000;

  return posts
    .filter((post) => {
      const postTime = new Date(post.createdAt).getTime();
      return Number.isFinite(postTime) && postTime >= cutoffTime && postTime <= snapshotTime;
    })
    .slice(0, limit);
}

function summarizeRun(run) {
  return {
    id: run.id,
    generatedAt: run.generatedAt,
    trigger: run.trigger,
    reason: run.reason,
    extractor: run.extractor,
    summary: run.summary,
    sourceFeed: run.sourceFeed,
    sourceRegistry: run.sourceRegistry,
    ingestionSummary: run.ingestion.summary,
    marketSummary: run.market.summary
  };
}

function summarizeEvalRun(run) {
  return run
    ? {
        id: run.id,
        generatedAt: run.generatedAt,
        trigger: run.trigger,
        suiteName: run.suiteName,
        promptVersion: run.promptVersion,
        extractor: run.extractor,
        summary: run.summary,
        failedCases: run.failedCases
      }
    : null;
}

function buildPlaceholders(decisionHistory, evalRuns) {
  return {
    decisionLogs: decisionHistory.slice(0, 6).map((entry) => ({
      id: entry.id,
      name: `${entry.asset} ${entry.action}`,
      description: entry.summary,
      state: entry.vetoed ? "Policy-adjusted" : "Recorded"
    })),
    simulationRuns: evalRuns.length
      ? evalRuns.slice(0, 4).map((run) => ({
          id: run.id,
          name: `${run.suiteName} eval`,
          description: `${Math.round(run.summary.averageScore * 100)}% average score across ${run.summary.caseCount} cases.`,
          state: run.extractor.activeMode
        }))
      : [
          {
            id: "eval-slot-001",
            name: "No evaluations yet",
            description: "Run the extraction eval harness to populate prompt-regression history.",
            state: "Waiting"
          }
        ]
  };
}

async function ensureBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = ensureLatestPipelineRun({
      trigger: "startup"
    }).catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
}

async function getPersistedAppState() {
  await ensureBootstrap();

  let latestSnapshot = getLatestPipelineSnapshot();

  if (!latestSnapshot) {
    await ensureLatestPipelineRun({
      trigger: "bootstrap-missing",
      force: true
    });
    latestSnapshot = getLatestPipelineSnapshot();
  }

  if (!latestSnapshot) {
    throw new Error("No persisted pipeline snapshot is available.");
  }

  const pipelineRuns = listPipelineRuns(12);
  const decisionHistory = listDecisionHistory(160);
  const evalRuns = listEvalRuns(12);
  const latestEvalRun = getLatestEvalRun();

  return {
    snapshot: latestSnapshot,
    appData: {
      ...latestSnapshot.appData,
      runtime: {
        scheduler: getBackgroundPipelineStatus()
      },
      history: {
        latestRunId: latestSnapshot.runId,
        runs: pipelineRuns.map((run) => summarizeRun(run)),
        decisionLog: decisionHistory
      },
      evaluation: {
        latestRun: summarizeEvalRun(latestEvalRun),
        history: evalRuns.map((run) => summarizeEvalRun(run))
      },
      placeholders: buildPlaceholders(decisionHistory, evalRuns)
    },
    storeStatus: {
      ...latestSnapshot.storeStatus,
      latestRunId: latestSnapshot.runId
    },
    pipelineRuns,
    decisionHistory,
    evalRuns
  };
}

createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (requestUrl.pathname === "/api/health") {
      const latestSnapshot = getLatestPipelineSnapshot();
      sendJson(response, 200, {
        ok: true,
        service: "x-ticker-investment",
        timestamp: new Date().toISOString(),
        latestRunId: latestSnapshot?.runId || "",
        scheduler: getBackgroundPipelineStatus()
      });
      return;
    }

    if (requestUrl.pathname === "/api/app-data") {
      const persistedState = await getPersistedAppState();
      sendJson(response, 200, persistedState.appData);
      return;
    }

    if (requestUrl.pathname === "/api/analysed-posts") {
      const days = Number(requestUrl.searchParams.get("days") || 3);
      const limit = Number(requestUrl.searchParams.get("limit") || 100);
      const persistedState = await getPersistedAppState();
      const posts = filterAnalysedPosts(
        persistedState.snapshot.appData.posts,
        persistedState.snapshot.generatedAt,
        {
          days,
          limit
        }
      );

      sendJson(response, 200, {
        mode: persistedState.snapshot.appData.metadata.tweetFeedMode,
        seededAt: persistedState.snapshot.generatedAt,
        engineMode: persistedState.snapshot.appData.engine.mode,
        count: posts.length,
        posts
      });
      return;
    }

    if (requestUrl.pathname === "/api/tweet-store/status") {
      const persistedState = await getPersistedAppState();
      sendJson(response, 200, persistedState.storeStatus);
      return;
    }

    if (requestUrl.pathname === "/api/pipeline/runs") {
      const persistedState = await getPersistedAppState();
      sendJson(response, 200, {
        ok: true,
        latestRunId: persistedState.snapshot.runId,
        runs: persistedState.pipelineRuns.map((run) => summarizeRun(run))
      });
      return;
    }

    if (requestUrl.pathname.startsWith("/api/pipeline/runs/")) {
      const runId = decodeURIComponent(requestUrl.pathname.replace("/api/pipeline/runs/", ""));
      const run = getPipelineRun(runId);

      if (!run) {
        sendError(response, 404, "Pipeline run not found.");
        return;
      }

      sendJson(response, 200, {
        ok: true,
        run
      });
      return;
    }

    if (requestUrl.pathname === "/api/evals/history") {
      const evalRuns = listEvalRuns(12);
      sendJson(response, 200, {
        ok: true,
        latestRunId: evalRuns[0]?.id || "",
        runs: evalRuns.map((run) => summarizeEvalRun(run))
      });
      return;
    }

    if (requestUrl.pathname === "/api/runtime/status") {
      sendJson(response, 200, {
        ok: true,
        scheduler: getBackgroundPipelineStatus()
      });
      return;
    }

    if (requestUrl.pathname.startsWith("/api/evals/history/")) {
      const runId = decodeURIComponent(requestUrl.pathname.replace("/api/evals/history/", ""));
      const run = getEvalRun(runId);

      if (!run) {
        sendError(response, 404, "Eval run not found.");
        return;
      }

      sendJson(response, 200, {
        ok: true,
        run
      });
      return;
    }

    if (requestUrl.pathname === "/api/engine/extraction-replay") {
      const postId = String(requestUrl.searchParams.get("postId") || "").trim();
      const live = requestUrl.searchParams.get("live") === "1";

      if (!postId) {
        sendError(response, 400, "postId is required.");
        return;
      }

      const persistedState = await getPersistedAppState();
      const tweetStore = readTweetStore();
      const sourceStore = readSourceStore();
      const rawPost = tweetStore.posts.find((post) => post.id === postId);

      if (!rawPost) {
        sendError(response, 404, "Post not found.");
        return;
      }

      const source = sourceStore.sources.find((item) => item.id === rawPost.sourceId) || null;
      const replay = await buildClaimExtractionReplay({
        post: rawPost,
        sources: sourceStore.sources,
        generatedAt: persistedState.snapshot.generatedAt,
        live
      });
      const heuristicBaseline = buildHeuristicPostAnalysis({
        post: rawPost,
        source,
        generatedAt: persistedState.snapshot.generatedAt
      });
      const cachedExtraction = replay.cache.entry?.extraction || null;
      const cachedNormalized = cachedExtraction
        ? buildNormalizedPostAnalysis({
            post: rawPost,
            source,
            generatedAt: persistedState.snapshot.generatedAt,
            extractedClaim: cachedExtraction,
            extractorMode: "openai-cache"
          })
        : null;
      const liveNormalized =
        replay.liveRun?.ok && replay.liveRun.parsedExtraction
          ? buildNormalizedPostAnalysis({
              post: rawPost,
              source,
              generatedAt: persistedState.snapshot.generatedAt,
              extractedClaim: replay.liveRun.parsedExtraction,
              extractorMode: "openai-live"
            })
          : null;

      sendJson(response, 200, {
        ok: true,
        postId,
        generatedAt: persistedState.snapshot.generatedAt,
        source,
        rawPost,
        currentSnapshotPost:
          persistedState.snapshot.appData.posts.find((post) => post.id === postId) || null,
        heuristicBaseline,
        cachedNormalized,
        liveNormalized,
        replay
      });
      return;
    }

    if (requestUrl.pathname === "/api/operator/sources") {
      if (request.method === "GET") {
        sendJson(response, 200, {
          ok: true,
          sources: listSources()
        });
        return;
      }

      if (request.method === "POST") {
        const payload = await readJsonBody(request);
        const source = createSource(payload);
        const pipelineResult = await runPipeline({
          trigger: "source-create",
          reason: source.id
        });
        sendJson(response, 201, {
          ok: true,
          source,
          pipelineRunId: pipelineResult.id
        });
        return;
      }
    }

    if (requestUrl.pathname.startsWith("/api/operator/sources/")) {
      const sourceId = decodeURIComponent(requestUrl.pathname.replace("/api/operator/sources/", ""));

      if (!sourceId) {
        sendError(response, 400, "Source id is required.");
        return;
      }

      if (request.method === "PUT") {
        const payload = await readJsonBody(request);
        const source = updateSource(sourceId, payload);
        const pipelineResult = await runPipeline({
          trigger: "source-update",
          reason: source.id
        });
        sendJson(response, 200, {
          ok: true,
          source,
          pipelineRunId: pipelineResult.id
        });
        return;
      }

      if (request.method === "DELETE") {
        if (hasTweetsForSource(sourceId)) {
          sendError(response, 409, "Delete or reassign tweets for this source before removing it.");
          return;
        }

        deleteSource(sourceId);
        const pipelineResult = await runPipeline({
          trigger: "source-delete",
          reason: sourceId
        });
        sendJson(response, 200, {
          ok: true,
          pipelineRunId: pipelineResult.id
        });
        return;
      }
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/admin/run-pipeline") {
      const payload = await readJsonBody(request);
      const pipelineResult = await runPipeline({
        trigger: "manual-admin",
        reason: String(payload.reason || "").trim()
      });
      sendJson(response, 200, {
        ok: true,
        runId: pipelineResult.id,
        summary: pipelineResult.summary
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/admin/run-evals") {
      const payload = await readJsonBody(request);
      const evalRun = await runExtractionEval({
        trigger: "manual-admin",
        preferredMode: String(payload.mode || "heuristic").trim() || "heuristic"
      });
      sendJson(response, 200, {
        ok: true,
        runId: evalRun.id,
        summary: evalRun.summary,
        extractor: evalRun.extractor,
        gate: evalRun.gate
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/admin/reseed-fake-tweets") {
      reseedTweetStore(100);
      const pipelineResult = await runPipeline({
        trigger: "reseed-fake-feed"
      });
      sendJson(response, 200, {
        ok: true,
        message: "Fake tweets reseeded and pipeline rerun",
        runId: pipelineResult.id,
        status: pipelineResult.snapshot.storeStatus
      });
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    sendError(response, 400, message);
    return;
  }

  const filePath = resolvePath(requestUrl.pathname);

  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });

  createReadStream(filePath).pipe(response);
})
  .listen(port, host, async () => {
    try {
      await ensureBootstrap();
      startBackgroundPipelineRunner();
      console.log(`x-ticker-investment running on http://${host}:${port}`);
    } catch (error) {
      console.error("Failed to bootstrap persisted pipeline snapshot.", error);
      process.exitCode = 1;
    }
  });
