import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyPostVerificationPolicy,
  attachLikelyImpacts,
  buildHeuristicPostAnalysis,
  buildNormalizedPostAnalysis
} from "./src/agenticEngine.js";
import {
  getBackgroundPipelineStatus,
  startBackgroundPipelineRunner,
  stopBackgroundPipelineRunner
} from "./src/backgroundPipelineRunner.js";
import {
  getManualFeedCronConfig,
  getManualFeedCronStatus,
  startManualFeedCronRunner,
  stopManualFeedCronRunner
} from "./src/manualFeedCronRunner.js";
import {
  buildCurrentDecisionReviewState,
  decorateDecisionHistoryWithReviews,
  DECISION_REVIEW_STATUSES,
  getDecisionReviewByAsset,
  listDecisionReviews,
  updateDecisionReviewStatus
} from "./src/decisionReviewStore.js";
import { answerFinancialQuestion } from "./src/financialAdvisor.js";
import { listAdvisorAnswers } from "./src/advisorStore.js";
import { runExtractionEval } from "./src/evalHarness.js";
import { getEvalRun, getLatestEvalRun, listEvalRuns } from "./src/evalStore.js";
import { readFinancialProfile, updateFinancialProfile } from "./src/financialProfileStore.js";
import {
  createLinkedinDraft,
  getLinkedinComposerCapabilities,
  getLinkedinComposerTools,
  rewriteLinkedinDraft
} from "./src/linkedinComposer.js";
import {
  getLinkedinDraft,
  getLatestLinkedinDraft,
  listLinkedinDrafts
} from "./src/linkedinDraftStore.js";
import { buildClaimExtractionReplay } from "./src/modelClaimExtractor.js";
import { buildImpactMappingReplay } from "./src/modelImpactMapper.js";
import { getNotificationStatus, sendNotification } from "./src/notificationProvider.js";
import { ensureLatestPipelineRun } from "./src/pipelineRunner.js";
import { getPostVerificationOverride, setPostVerificationOverride } from "./src/postVerificationStore.js";
import {
  DECISION_FOLLOW_UP_STATES,
  getDecisionHistoryEntry,
  getLatestPipelineSnapshot,
  getPipelineRun,
  listDecisionHistory,
  listPipelineRuns,
  updateDecisionHistoryEntry
} from "./src/pipelineStore.js";
import { executePipelineJob, getOrchestratorStatus, sendDailyDigest } from "./src/orchestrator.js";
import { monitoredUniverse } from "./src/data.js";
import { getTelegramBotStatus, startTelegramBotRunner } from "./src/telegramBotRunner.js";
import { hasTweetsForSource, importManualPosts, readTweetStore, reseedTweetStore } from "./src/tweetStore.js";
import {
  analyzePolymarketBet,
  buildStoredPolymarketState,
  getPolymarketMarkets,
  getPolymarketStatus,
  placePolymarketOrder
} from "./src/polymarketDesk.js";
import { buildAssetIntel } from "./src/assetIntelProvider.js";
import {
  buildStoredPaperTradingState,
  createPaperTrade,
  findActivePaperTradeByDecisionId,
  getPaperTrade,
  listPaperTrades,
  updatePaperTrade
} from "./src/paperTradeStore.js";
import { buildPortfolioAssessment } from "./src/portfolioAssessment.js";
import {
  getPaperTradePriceProviderConfig,
  getPaperTradePriceSnapshot
} from "./src/paperTradePriceProvider.js";
import {
  createSource,
  deleteSource,
  listSources,
  readSourceStore,
  updateSource
} from "./src/sourceStore.js";
import {
  buildResearchDashboardState,
  createResearchDossier,
  deleteResearchDossier,
  getResearchDossier,
  RESEARCH_DOSSIER_STATUSES,
  updateResearchDossier
} from "./src/researchStore.js";
import { buildTradeReadinessState } from "./src/tradeReadiness.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 1024 * 1024);
const REVIEW_READY_RESEARCH_STATUSES = new Set(["validated", "approved"]);
const ACTIONABLE_RESEARCH_STATUSES = new Set(["approved"]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

let bootstrapPromise = null;
let bootstrapStatus = {
  status: "idle",
  lastAttemptAt: "",
  lastSuccessAt: "",
  lastError: "",
  fallbackSnapshotRunId: "",
  usingFallbackSnapshot: false
};

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

function formatBootstrapError(error) {
  if (error && typeof error === "object" && typeof error.userMessage === "string" && error.userMessage.trim()) {
    return error.userMessage.trim();
  }

  return error instanceof Error ? error.message : "Bootstrap refresh failed.";
}

function setBootstrapStatus(patch = {}) {
  bootstrapStatus = {
    ...bootstrapStatus,
    ...patch
  };

  return bootstrapStatus;
}

function getBootstrapStatus() {
  return {
    ...bootstrapStatus
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    let totalBytes = 0;

    request.on("data", (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > MAX_JSON_BODY_BYTES) {
        request.destroy();
        const error = new Error(`JSON body exceeds ${MAX_JSON_BODY_BYTES} bytes.`);
        error.statusCode = 413;
        reject(error);
        return;
      }

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

function parseCommaSeparatedList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseManualImportText(value) {
  const rawText = String(value || "").trim();

  if (!rawText) {
    return [];
  }

  return rawText
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const firstLine = lines[0] || "";
      const separatorIndex = firstLine.indexOf("|");

      if (separatorIndex > 0) {
        const timestampCandidate = firstLine.slice(0, separatorIndex).trim();
        const parsedDate = new Date(timestampCandidate);

        if (!Number.isNaN(parsedDate.getTime())) {
          return {
            createdAt: parsedDate.toISOString(),
            body: [firstLine.slice(separatorIndex + 1).trim(), ...lines.slice(1)]
              .filter(Boolean)
              .join("\n")
          };
        }
      }

      return {
        body: lines.join("\n")
      };
    })
    .filter((item) => item.body);
}

function resolveManualImportSource(payload) {
  const sources = listSources();
  const sourceId = String(payload.sourceId || "").trim();

  if (sourceId) {
    const existingSource = sources.find((source) => source.id === sourceId);

    if (!existingSource) {
      throw new Error("The selected manual-import source does not exist.");
    }

    return existingSource;
  }

  const handle = String(payload.sourceHandle || "@personaldesk").trim();
  const existingByHandle = sources.find(
    (source) => source.handle.toLowerCase() === handle.toLowerCase()
  );

  if (existingByHandle) {
    return existingByHandle;
  }

  return createSource({
    handle,
    name: String(payload.sourceName || "Personal Desk").trim() || handle,
    category: String(payload.sourceCategory || "Manual / Single User").trim(),
    baselineReliability: Number(payload.baselineReliability || 0.64),
    preferredHorizon: "0-3 days",
    policyTemplate: "Manual inbox source used for pasted posts and links.",
    relevantSectors: parseCommaSeparatedList(payload.relevantSectors),
    allowedAssets: parseCommaSeparatedList(payload.allowedAssets).length
      ? parseCommaSeparatedList(payload.allowedAssets)
      : monitoredUniverse.map((asset) => asset.ticker),
    specialHandling: "Treat as user-curated manual input. Require corroboration before high-conviction upgrades.",
    tone: "Direct"
  });
}

function resolveAdHocTestSource(payload, sources = []) {
  const requestedSourceId = String(payload.sourceId || "").trim();
  const requestedHandle = String(payload.sourceHandle || "").trim();
  const existingSource =
    sources.find((source) => source.id === requestedSourceId) ||
    sources.find(
      (source) =>
        requestedHandle && String(source.handle || "").toLowerCase() === requestedHandle.toLowerCase()
    ) ||
    null;
  const handle = String(requestedHandle || existingSource?.handle || "@testbench").trim() || "@testbench";
  const normalizedHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const sourceToken = normalizeTicker(normalizedHandle).toLowerCase() || "testbench";
  const allowedAssets = parseCommaSeparatedList(payload.allowedAssets);
  const relevantSectors = parseCommaSeparatedList(payload.relevantSectors);

  return {
    ...(existingSource || {}),
    id: existingSource?.id || `adhoc-${sourceToken}`,
    handle: normalizedHandle,
    name: String(payload.sourceName || existingSource?.name || "Ad hoc test source").trim() || normalizedHandle,
    category:
      String(payload.sourceCategory || existingSource?.category || "Test / Ad hoc").trim() || "Test / Ad hoc",
    baselineReliability: Number(payload.baselineReliability || existingSource?.baselineReliability || 0.64),
    preferredHorizon: String(existingSource?.preferredHorizon || "0-3 days"),
    policyTemplate:
      String(existingSource?.policyTemplate || "Ad hoc single-post test source used from the Tests tab."),
    relevantSectors:
      relevantSectors.length
        ? relevantSectors
        : Array.isArray(existingSource?.relevantSectors)
          ? existingSource.relevantSectors
          : [],
    allowedAssets:
      allowedAssets.length
        ? allowedAssets
        : Array.isArray(existingSource?.allowedAssets) && existingSource.allowedAssets.length
          ? existingSource.allowedAssets
          : monitoredUniverse.map((asset) => asset.ticker),
    specialHandling: String(existingSource?.specialHandling || ""),
    tone: String(existingSource?.tone || "Custom"),
    lastActive: new Date().toISOString()
  };
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
        validationMode: run.validationMode,
        extractor: run.extractor,
        summary: run.summary,
        gate: run.gate,
        failedCases: run.failedCases
      }
    : null;
}

function getEvalMode(run) {
  return run?.extractor?.activeMode || run?.validationMode || run?.model?.provider || "model";
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
          state: getEvalMode(run)
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

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function normalizeResearchStatus(value) {
  const normalizedValue = String(value || "discovery")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (normalizedValue === "draft" || normalizedValue === "intake") {
    return "discovery";
  }

  if (normalizedValue === "in_review" || normalizedValue === "review") {
    return "candidate";
  }

  return normalizedValue || "discovery";
}

function getResearchStatusRank(status) {
  const rank = {
    approved: 6,
    validated: 5,
    candidate: 4,
    discovery: 3,
    dismissed: 2,
    expired: 1,
    archived: 0
  };

  return rank[normalizeResearchStatus(status)] ?? -1;
}

function buildDecisionMathPayload(decision = {}) {
  if (decision?.decisionMath) {
    return decision.decisionMath;
  }

  const payload = {
    thesisProbability: decision?.thesisProbability,
    uncertainty: decision?.uncertaintyScore ?? decision?.uncertaintyValue ?? null,
    expectedUpside: decision?.expectedUpside,
    expectedDownside: decision?.expectedDownside,
    rewardRisk: decision?.rewardRisk,
    sizeBand: decision?.sizeBand,
    maxLossGuardrail: decision?.maxLossGuardrail,
    decisionMathSummary: decision?.decisionMathSummary
  };

  return Object.values(payload).some((value) => value != null && value !== "") ? payload : null;
}

function summarizeLinkedResearch(dossier) {
  if (!dossier) {
    return null;
  }

  return {
    id: dossier.id,
    title: dossier.title,
    theme: dossier.theme,
    thesis: dossier.thesis,
    summary: dossier.summary,
    horizon: dossier.horizon,
    status: normalizeResearchStatus(dossier.status),
    assets: dossier.assets || [],
    supportingEvidenceCount: dossier.supportingEvidence?.length || 0,
    contradictingEvidenceCount: dossier.contradictingEvidence?.length || 0,
    citationsCount: dossier.citations?.length || 0,
    sourceQualityScore: dossier.sourceQualityScore,
    timelinessScore: dossier.timelinessScore,
    updatedAt: dossier.updatedAt || "",
    createdAt: dossier.createdAt || "",
    supportingEvidence: dossier.supportingEvidence || [],
    contradictingEvidence: dossier.contradictingEvidence || []
  };
}

function buildResearchLookup(dossiers = []) {
  const researchByAsset = new Map();

  for (const dossier of dossiers) {
    for (const asset of dossier.assets || []) {
      const ticker = normalizeTicker(asset);
      const current = researchByAsset.get(ticker);

      if (!current) {
        researchByAsset.set(ticker, dossier);
        continue;
      }

      const rankDifference =
        getResearchStatusRank(dossier.status) - getResearchStatusRank(current.status);

      if (rankDifference > 0) {
        researchByAsset.set(ticker, dossier);
        continue;
      }

      if (
        rankDifference === 0 &&
        String(dossier.updatedAt || "").localeCompare(String(current.updatedAt || "")) > 0
      ) {
        researchByAsset.set(ticker, dossier);
      }
    }
  }

  return researchByAsset;
}

function decorateDecisionWithResearch(decision, linkedResearch) {
  const researchStatus = normalizeResearchStatus(linkedResearch?.status);
  const researchEligibleForReview = linkedResearch
    ? REVIEW_READY_RESEARCH_STATUSES.has(researchStatus)
    : false;
  const researchApproved = linkedResearch
    ? ACTIONABLE_RESEARCH_STATUSES.has(researchStatus)
    : false;
  const researchBlockingReason = !linkedResearch
    ? `Capture a research dossier for ${decision.asset} before it reaches the approval queue.`
    : researchEligibleForReview
      ? ""
      : `${linkedResearch.title || linkedResearch.theme || decision.asset} is still ${researchStatus}; validate the thesis before it enters the queue.`;

  return {
    ...decision,
    decisionMath: buildDecisionMathPayload(decision),
    linkedResearchId: linkedResearch?.id || "",
    linkedResearch: summarizeLinkedResearch(linkedResearch),
    researchStatus: linkedResearch ? researchStatus : "discovery",
    researchEligibleForReview,
    researchApproved,
    researchBlockingReason,
    researchUpdatedAt: linkedResearch?.updatedAt || ""
  };
}

function decorateReviewItemWithResearch(item, researchByAsset) {
  const linkedResearch = researchByAsset.get(normalizeTicker(item.asset)) || null;
  const researchStatus = normalizeResearchStatus(linkedResearch?.status);
  const researchEligibleForReview = linkedResearch
    ? REVIEW_READY_RESEARCH_STATUSES.has(researchStatus)
    : false;
  const researchApproved = linkedResearch
    ? ACTIONABLE_RESEARCH_STATUSES.has(researchStatus)
    : false;

  return {
    ...item,
    linkedResearchId: linkedResearch?.id || "",
    linkedResearch: summarizeLinkedResearch(linkedResearch),
    researchStatus: linkedResearch ? researchStatus : "discovery",
    researchEligibleForReview,
    researchApproved,
    researchBlockingReason: !linkedResearch
      ? `Capture a research dossier for ${item.asset} before it reaches the approval queue.`
      : researchEligibleForReview
        ? ""
        : `${linkedResearch.title || linkedResearch.theme || item.asset} is still ${researchStatus}; validate the thesis before it enters the queue.`
  };
}

function truncateText(value, maxLength = 220) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function roundScore(value, digits = 2) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Number(numericValue.toFixed(digits)) : 0;
}

function buildSeedThemeForDecision(assetProfile, decision = {}) {
  if (decision?.clusterIds?.[0]) {
    return String(decision.clusterIds[0])
      .replace(/^cluster-/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  return assetProfile?.bucket || "General";
}

function buildSeedSupportingEvidence(decision, relatedPosts, sourceById) {
  const evidence = [];

  for (const rationale of decision?.rationale || []) {
    if (!String(rationale || "").trim()) {
      continue;
    }

    evidence.push({
      label: "Engine rationale",
      summary: String(rationale).trim(),
      source: "Decision engine",
      weight: 0.58
    });
  }

  for (const post of relatedPosts) {
    const source = sourceById.get(post.sourceId);
    evidence.push({
      label: source?.name || source?.handle || post.sourceId,
      summary: truncateText(post.body, 240),
      source: source?.name || source?.handle || "Imported source",
      url: post.canonicalUrl || post.xUrl || "",
      publishedAt: post.createdAt || "",
      weight: Number(source?.baselineReliability || 0.6),
      note: post.authorHandle ? `Imported from ${post.authorHandle}` : ""
    });
  }

  return evidence.slice(0, 8);
}

function buildSeedContradictingEvidence(decision) {
  const entries = [];

  for (const item of decision?.whyNot || []) {
    if (String(item || "").trim()) {
      entries.push({
        label: "Why not",
        summary: String(item).trim(),
        source: "Decision engine",
        weight: 0.46
      });
    }
  }

  for (const item of decision?.uncertainty || []) {
    if (String(item || "").trim()) {
      entries.push({
        label: "Uncertainty",
        summary: String(item).trim(),
        source: "Decision engine",
        weight: 0.42
      });
    }
  }

  if (decision?.vetoReason) {
    entries.push({
      label: "Policy veto",
      summary: String(decision.vetoReason).trim(),
      source: "Policy layer",
      weight: 0.54
    });
  }

  return entries.slice(0, 8);
}

function buildSeedCitations(relatedPosts, sourceById) {
  return relatedPosts.slice(0, 6).map((post, index) => {
    const source = sourceById.get(post.sourceId);

    return {
      id: `seed-citation-${index + 1}`,
      label: source?.handle || source?.name || post.sourceId || `Citation ${index + 1}`,
      summary: truncateText(post.body, 200),
      source: source?.name || source?.handle || "Imported source",
      url: post.canonicalUrl || post.xUrl || "",
      publishedAt: post.createdAt || "",
      note: post.importMethod ? `Imported via ${post.importMethod}` : ""
    };
  });
}

function buildResearchSeedPayload(assetTicker, decision, relatedPosts, sourceById) {
  const cleanTicker = normalizeTicker(assetTicker);
  const assetProfile = monitoredUniverse.find((asset) => asset.ticker === cleanTicker) || null;
  const supportingEvidence = buildSeedSupportingEvidence(decision, relatedPosts, sourceById);
  const contradictingEvidence = buildSeedContradictingEvidence(decision);
  const citations = buildSeedCitations(relatedPosts, sourceById);
  const averageSourceQuality =
    relatedPosts.reduce((sum, post) => {
      const source = sourceById.get(post.sourceId);
      return sum + Number(source?.baselineReliability || 0.6);
    }, 0) / Math.max(relatedPosts.length, 1);

  return {
    title: `${cleanTicker} thesis seed`,
    theme: buildSeedThemeForDecision(assetProfile, decision),
    assets: [cleanTicker],
    horizon: String(decision?.horizon || assetProfile?.bucket || "2-7 days").trim(),
    thesis: String((decision?.rationale || []).join(" ") || assetProfile?.thesis || "").trim(),
    summary: String(
      decision?.decisionMathSummary ||
        decision?.rationale?.[0] ||
        assetProfile?.thesis ||
        `${cleanTicker} research seed created from the latest decision queue.`
    ).trim(),
    supportingEvidence,
    contradictingEvidence,
    citations,
    sourceQualityScore: roundScore(
      relatedPosts.length ? averageSourceQuality : decision?.confidence || 0.62
    ),
    timelinessScore: roundScore(relatedPosts.length ? 0.72 : 0.58),
    edgeHypothesis: String(
      decision?.decisionMathSummary ||
        `If the current ${cleanTicker} thesis holds, the setup may still be mispriced relative to the recent narrative and market context.`
    ).trim(),
    riskFactors: [
      ...new Set(
        [
          ...(decision?.uncertainty || []),
          ...(assetProfile?.riskFlag ? [assetProfile.riskFlag] : [])
        ]
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    ].slice(0, 6),
    status: "candidate",
    linkedClusterIds: Array.isArray(decision?.clusterIds) ? decision.clusterIds : []
  };
}

async function seedResearchDossiersFromLiveQueue({
  assets = [],
  missingOnly = true
} = {}) {
  const persistedState = await getPersistedAppState();
  const decisions = persistedState.snapshot?.appData?.decisions || [];
  const blockedReviewAssets = (persistedState.appData?.reviews?.blocked || []).map((item) => item.asset);
  const requestedAssets = Array.isArray(assets)
    ? assets.map((asset) => normalizeTicker(asset)).filter(Boolean)
    : [];
  const targetAssets = requestedAssets.length
    ? requestedAssets
    : [...new Set(blockedReviewAssets.length ? blockedReviewAssets : decisions.map((decision) => decision.asset))];
  const sourceById = new Map(
    (persistedState.snapshot?.appData?.sources || listSources()).map((source) => [source.id, source])
  );
  const posts = persistedState.snapshot?.appData?.posts || [];
  const existingResearchByAsset = buildResearchLookup(buildResearchDashboardState().dossiers);
  const created = [];
  const skipped = [];

  for (const assetTicker of targetAssets) {
    const decision = decisions.find((item) => normalizeTicker(item.asset) === assetTicker);

    if (!decision) {
      skipped.push({
        asset: assetTicker,
        reason: "No current decision was available to seed from."
      });
      continue;
    }

    if (missingOnly && existingResearchByAsset.get(assetTicker)) {
      skipped.push({
        asset: assetTicker,
        reason: "Research dossier already exists for this asset."
      });
      continue;
    }

    const relatedPosts = posts
      .filter((post) => (post.mappedAssets || []).map((item) => normalizeTicker(item)).includes(assetTicker))
      .slice(0, 6);
    const dossier = createResearchDossier(
      buildResearchSeedPayload(assetTicker, decision, relatedPosts, sourceById)
    );

    created.push({
      asset: assetTicker,
      dossier
    });
  }

  return {
    requestedAssets: targetAssets,
    createdCount: created.length,
    skippedCount: skipped.length,
    created,
    skipped
  };
}

function derivePaperTradeSide(action) {
  const normalizedAction = String(action || "").trim().toUpperCase();

  if (normalizedAction === "BUY") {
    return "long";
  }

  if (normalizedAction === "SELL") {
    return "short";
  }

  throw new Error("Only BUY or SELL decisions can open a paper trade.");
}

function getLatestMarketSnapshot() {
  return getLatestPipelineSnapshot()?.appData?.market || null;
}

function mergeMarkSnapshots(primarySnapshot = null, fallbackSnapshot = null) {
  if (!primarySnapshot && !fallbackSnapshot) {
    return null;
  }

  if (!primarySnapshot) {
    return fallbackSnapshot;
  }

  if (!fallbackSnapshot) {
    return primarySnapshot;
  }

  const primaryByTicker = primarySnapshot.byTicker || {};
  const fallbackAssets = Array.isArray(fallbackSnapshot.assets) ? fallbackSnapshot.assets : [];
  const primaryAssets = Array.isArray(primarySnapshot.assets) ? primarySnapshot.assets : [];

  return {
    ...fallbackSnapshot,
    ...primarySnapshot,
    generatedAt: primarySnapshot.generatedAt || fallbackSnapshot.generatedAt || new Date().toISOString(),
    warnings: [
      ...(fallbackSnapshot.warnings || []),
      ...(primarySnapshot.warnings || [])
    ],
    assets: [
      ...fallbackAssets.filter((asset) => !primaryByTicker[asset.ticker]),
      ...primaryAssets
    ],
    byTicker: {
      ...(fallbackSnapshot.byTicker || {}),
      ...primaryByTicker
    }
  };
}

async function getPaperTradeMarkWorkspace({ tickers = [] } = {}) {
  const latestMarketSnapshot = getLatestMarketSnapshot();
  const priceSnapshot = await getPaperTradePriceSnapshot({ tickers });
  const mergedMarketSnapshot =
    priceSnapshot.activeProvider !== "none"
      ? mergeMarkSnapshots(priceSnapshot, latestMarketSnapshot)
      : latestMarketSnapshot;

  return {
    marketSnapshot: mergedMarketSnapshot,
    markProvider: {
      ...priceSnapshot,
      fallbackProvider: latestMarketSnapshot?.activeProvider || "none",
      fallbackGeneratedAt: latestMarketSnapshot?.generatedAt || "",
      config: getPaperTradePriceProviderConfig()
    }
  };
}

function resolvePaperTradeEntryPrice(payload, decisionEntry, marketSnapshot) {
  const manualEntryPrice = Number(payload.entryPrice);

  if (Number.isFinite(manualEntryPrice) && manualEntryPrice > 0) {
    return {
      price: manualEntryPrice,
      source: "manual",
      asOf: payload.entryPriceAsOf || new Date().toISOString()
    };
  }

  const referencePrice = Number(decisionEntry?.referencePrice);

  if (Number.isFinite(referencePrice) && referencePrice > 0) {
    return {
      price: referencePrice,
      source: "decision-reference",
      asOf: decisionEntry.generatedAt || new Date().toISOString()
    };
  }

  const marketPrice = Number(marketSnapshot?.byTicker?.[decisionEntry?.asset]?.lastPrice);

  if (
    Number.isFinite(marketPrice) &&
    marketPrice > 0 &&
    marketSnapshot?.activeProvider !== "mock"
  ) {
    return {
      price: marketPrice,
      source: "market-snapshot",
      asOf: marketSnapshot.byTicker[decisionEntry.asset]?.generatedAt || marketSnapshot.generatedAt || ""
    };
  }

  throw new Error(
    "An entry price is required because no usable real market snapshot is available for this asset."
  );
}

function buildReviewSummary(items, blockedItems = []) {
  const proposedCount = items.filter((item) => item.reviewStatus === "proposed").length;
  const approvedCount = items.filter((item) => item.reviewStatus === "approved").length;
  const dismissedCount = items.filter((item) => item.reviewStatus === "dismissed").length;

  return {
    totalCount: items.length,
    proposedCount,
    approvedCount,
    dismissedCount,
    reviewedCount: approvedCount + dismissedCount,
    blockedCount: blockedItems.length,
    nextDecisionId: items.find((item) => item.reviewStatus === "proposed")?.id || ""
  };
}

function filterReviewStateByResearch(reviewState, researchByAsset) {
  const decoratedCurrent = (reviewState.current || []).map((item) =>
    decorateReviewItemWithResearch(item, researchByAsset)
  );
  const eligibleCurrent = decoratedCurrent.filter((item) => item.researchEligibleForReview);
  const queueBase = decoratedCurrent.some((item) => item.tracked)
    ? decoratedCurrent.filter((item) => item.tracked)
    : decoratedCurrent;
  const visibleQueue = queueBase.filter((item) => item.researchEligibleForReview);
  const blocked = decoratedCurrent.filter((item) => !item.researchEligibleForReview);

  return {
    summary: buildReviewSummary(visibleQueue, blocked),
    queue: visibleQueue,
    current: eligibleCurrent,
    blocked
  };
}

async function ensureBootstrap() {
  if (!bootstrapPromise) {
    const startedAt = new Date().toISOString();
    setBootstrapStatus({
      status: "running",
      lastAttemptAt: startedAt,
      lastError: "",
      usingFallbackSnapshot: false,
      fallbackSnapshotRunId: ""
    });
    bootstrapPromise = ensureLatestPipelineRun({
      trigger: "startup"
    })
      .then((result) => {
        setBootstrapStatus({
          status: "ready",
          lastAttemptAt: startedAt,
          lastSuccessAt: new Date().toISOString(),
          lastError: "",
          usingFallbackSnapshot: false,
          fallbackSnapshotRunId: ""
        });
        return result;
      })
      .catch((error) => {
        const latestSnapshot = getLatestPipelineSnapshot();
        const message = formatBootstrapError(error);

        if (latestSnapshot) {
          setBootstrapStatus({
            status: "degraded",
            lastAttemptAt: startedAt,
            lastError: message,
            usingFallbackSnapshot: true,
            fallbackSnapshotRunId: latestSnapshot.runId || ""
          });

          return {
            run: null,
            snapshot: latestSnapshot,
            dependencyKey: "",
            reused: true,
            degraded: true,
            errorMessage: message
          };
        }

        setBootstrapStatus({
          status: "failed",
          lastAttemptAt: startedAt,
          lastError: message,
          usingFallbackSnapshot: false,
          fallbackSnapshotRunId: ""
        });
        bootstrapPromise = null;
        throw error;
      });
  }

  return bootstrapPromise;
}

async function getPersistedAppState() {
  try {
    await ensureBootstrap();
  } catch (error) {
    const latestSnapshot = getLatestPipelineSnapshot();

    if (!latestSnapshot) {
      const message = formatBootstrapError(error);
      const bootstrapError = new Error(message);
      bootstrapError.statusCode = 503;
      throw bootstrapError;
    }
  }

  let latestSnapshot = getLatestPipelineSnapshot();

  if (
    latestSnapshot &&
    bootstrapStatus.status === "degraded" &&
    new Date(latestSnapshot.generatedAt || 0).getTime() > new Date(bootstrapStatus.lastAttemptAt || 0).getTime()
  ) {
    setBootstrapStatus({
      status: "ready",
      lastSuccessAt: latestSnapshot.generatedAt || new Date().toISOString(),
      lastError: "",
      usingFallbackSnapshot: false,
      fallbackSnapshotRunId: ""
    });
  }

  if (!latestSnapshot) {
    try {
      await ensureLatestPipelineRun({
        trigger: "bootstrap-missing",
        force: true
      });
    } catch (error) {
      const message = formatBootstrapError(error);
      const bootstrapError = new Error(message);
      bootstrapError.statusCode = 503;
      throw bootstrapError;
    }
    latestSnapshot = getLatestPipelineSnapshot();
  }

  if (!latestSnapshot) {
    const bootstrapError = new Error(
      "No persisted pipeline snapshot is available yet. Fix the feed connection or switch to a local/manual feed, then rerun the pipeline."
    );
    bootstrapError.statusCode = 503;
    throw bootstrapError;
  }

  const pipelineRuns = listPipelineRuns(12);
  const decisionHistory = listDecisionHistory(160);
  const evalRuns = listEvalRuns(12);
  const latestEvalRun = getLatestEvalRun();
  const financialProfile = readFinancialProfile();
  const advisorHistory = listAdvisorAnswers(10);
  const researchState = buildResearchDashboardState();
  const liveSources = listSources();
  const researchByAsset = buildResearchLookup(researchState.dossiers);
  const decoratedSnapshot = {
    ...latestSnapshot,
    appData: {
      ...latestSnapshot.appData,
      sources: liveSources,
      decisions: (latestSnapshot.appData?.decisions || []).map((decision) =>
        decorateDecisionWithResearch(
          decision,
          researchByAsset.get(normalizeTicker(decision.asset)) || null
        )
      )
    }
  };
  const decisionReviewState = buildCurrentDecisionReviewState({
    snapshot: decoratedSnapshot,
    financialProfile
  });
  const gatedReviewState = filterReviewStateByResearch(decisionReviewState, researchByAsset);
  const decoratedDecisionHistory = decorateDecisionHistoryWithReviews(decisionHistory);
  const recentDecisionReviews = listDecisionReviews(16);
  const tradeReadiness = buildTradeReadinessState({
    snapshot: decoratedSnapshot,
    evalRuns,
    researchDossiers: researchState.dossiers,
    reviewItems: gatedReviewState.current
  });
  const paperTradeTickers = [
    ...new Set(
      listPaperTrades()
        .filter((trade) => ["planned", "open"].includes(String(trade.status || "").trim().toLowerCase()))
        .map((trade) => trade.asset)
        .filter(Boolean)
    )
  ];
  const paperTradeWorkspace = await getPaperTradeMarkWorkspace({
    tickers: paperTradeTickers
  });
  const paperTradingState = buildStoredPaperTradingState({
    marketSnapshot: paperTradeWorkspace.marketSnapshot,
    markProvider: paperTradeWorkspace.markProvider
  });
  const portfolioAssessment = buildPortfolioAssessment({
    snapshot: decoratedSnapshot,
    financialProfile,
    researchDossiers: researchState.dossiers,
    reviewItems: decisionReviewState.current,
    paperTradingState,
    tradeReadiness
  });

  return {
    snapshot: decoratedSnapshot,
    appData: {
      ...decoratedSnapshot.appData,
      runtime: {
        bootstrap: getBootstrapStatus(),
        scheduler: getBackgroundPipelineStatus(),
        manualFeedCron: getManualFeedCronStatus(),
        orchestrator: getOrchestratorStatus(),
        telegramBot: getTelegramBotStatus(),
        tradeReadiness
      },
      history: {
        latestRunId: latestSnapshot.runId,
        runs: pipelineRuns.map((run) => summarizeRun(run)),
        decisionLog: decoratedDecisionHistory,
        followUpStates: DECISION_FOLLOW_UP_STATES
      },
      evaluation: {
        latestRun: summarizeEvalRun(latestEvalRun),
        history: evalRuns.map((run) => summarizeEvalRun(run))
      },
      research: researchState,
      reviews: {
        summary: gatedReviewState.summary,
        queue: gatedReviewState.queue,
        current: gatedReviewState.current,
        blocked: gatedReviewState.blocked,
        recent: recentDecisionReviews
      },
      advisor: {
        financialProfile,
        history: advisorHistory,
        portfolioAssessment
      },
      paperTrading: paperTradingState,
      polymarket: buildStoredPolymarketState(),
      placeholders: buildPlaceholders(decoratedDecisionHistory, evalRuns)
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
        bootstrap: getBootstrapStatus(),
        scheduler: getBackgroundPipelineStatus(),
        manualFeedCron: getManualFeedCronStatus(),
        notifications: getNotificationStatus().config,
        telegramBot: getTelegramBotStatus()
      });
      return;
    }

    if (requestUrl.pathname === "/api/app-data") {
      const persistedState = await getPersistedAppState();
      sendJson(response, 200, persistedState.appData);
      return;
    }

    if (requestUrl.pathname === "/api/linkedin-composer/state" && request.method === "GET") {
      sendJson(response, 200, {
        ok: true,
        capabilities: getLinkedinComposerCapabilities(),
        tools: getLinkedinComposerTools(),
        latestDraft: getLatestLinkedinDraft(),
        drafts: listLinkedinDrafts(60),
        recentDrafts: listLinkedinDrafts(12),
        telegramBot: getTelegramBotStatus()
      });
      return;
    }

    if (requestUrl.pathname === "/api/linkedin-composer/drafts" && request.method === "POST") {
      const payload = await readJsonBody(request);
      const draft = await createLinkedinDraft({
        xUrl: payload.xUrl,
        manualText: payload.manualText,
        manualAuthor: payload.manualAuthor,
        manualMediaNotes: payload.manualMediaNotes,
        voice: payload.voice,
        origin: payload.origin || "ui"
      });

      sendJson(response, 201, {
        ok: true,
        capabilities: getLinkedinComposerCapabilities(),
        tools: getLinkedinComposerTools(),
        draft
      });
      return;
    }

    if (requestUrl.pathname.startsWith("/api/linkedin-composer/drafts/")) {
      const tail = requestUrl.pathname.replace("/api/linkedin-composer/drafts/", "");
      const draftId = decodeURIComponent(tail.replace(/\/rewrite$/, ""));
      const isRewriteRoute = requestUrl.pathname.endsWith("/rewrite");

      if (!draftId) {
        sendError(response, 400, "LinkedIn draft id is required.");
        return;
      }

      if (request.method === "GET" && !isRewriteRoute) {
        const draft = getLinkedinDraft(draftId);

        if (!draft) {
          sendError(response, 404, "LinkedIn draft not found.");
          return;
        }

        sendJson(response, 200, {
          ok: true,
          draft
        });
        return;
      }

      if (request.method === "POST" && isRewriteRoute) {
        const payload = await readJsonBody(request);
        const draft = await rewriteLinkedinDraft({
          draftId,
          instructions: payload.instructions,
          voice: payload.voice,
          origin: payload.origin || "ui-rewrite"
        });

        sendJson(response, 201, {
          ok: true,
          capabilities: getLinkedinComposerCapabilities(),
          tools: getLinkedinComposerTools(),
          draft
        });
        return;
      }
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
        scheduler: getBackgroundPipelineStatus(),
        manualFeedCron: getManualFeedCronStatus(),
        orchestrator: getOrchestratorStatus(),
        telegramBot: getTelegramBotStatus()
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

    if (requestUrl.pathname === "/api/engine/test-drive" && request.method === "POST") {
      const payload = await readJsonBody(request);
      const body = String(payload.rawText || payload.body || "").trim();

      if (!body) {
        sendError(response, 400, "Paste a tweet or note before running a test.");
        return;
      }

      const persistedState = await getPersistedAppState();
      const generatedAt = persistedState.snapshot?.generatedAt || new Date().toISOString();
      const financialProfile = persistedState.appData?.advisor?.financialProfile || readFinancialProfile();
      const sourceStore = readSourceStore();
      const source = resolveAdHocTestSource(payload, sourceStore.sources);
      const rawPost = {
        id: `adhoc-test-${Date.now()}`,
        sourceId: source.id,
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        body
      };
      const sources = [
        ...sourceStore.sources.filter((item) => item.id !== source.id),
        source
      ];
      const replay = await buildClaimExtractionReplay({
        post: rawPost,
        sources,
        generatedAt,
        live: payload.runLive !== false
      });
      const heuristicBaseline = buildHeuristicPostAnalysis({
        post: rawPost,
        source,
        generatedAt
      });
      const cachedExtraction = replay.cache.entry?.extraction || null;
      const cachedNormalized = cachedExtraction
        ? buildNormalizedPostAnalysis({
            post: rawPost,
            source,
            generatedAt,
            extractedClaim: cachedExtraction,
            extractorMode: "openai-cache"
          })
        : null;
      const liveNormalized =
        replay.liveRun?.ok && replay.liveRun.parsedExtraction
          ? buildNormalizedPostAnalysis({
              post: rawPost,
              source,
              generatedAt,
              extractedClaim: replay.liveRun.parsedExtraction,
            extractorMode: "openai-live"
          })
          : null;
      const baseSelectedNormalized = liveNormalized || cachedNormalized || heuristicBaseline;
      const impactReplay = await buildImpactMappingReplay({
        post: baseSelectedNormalized,
        sources,
        financialProfile,
        generatedAt,
        live: payload.runLive !== false
      });
      const selectedNormalized = attachLikelyImpacts(
        baseSelectedNormalized,
        impactReplay.liveRun?.ok
          ? impactReplay.liveRun.parsedImpacts
          : impactReplay.cache?.parsedImpacts || []
      );
      const verifiedSelected = applyPostVerificationPolicy({
        posts: [selectedNormalized],
        sources
      }).posts[0];

      sendJson(response, 200, {
        ok: true,
        generatedAt,
        source,
        rawPost,
        heuristicBaseline,
        cachedNormalized,
        liveNormalized,
        selectedNormalized: verifiedSelected,
        replay,
        impactReplay
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

    if (requestUrl.pathname.startsWith("/api/intel/assets/") && request.method === "GET") {
      const ticker = decodeURIComponent(requestUrl.pathname.replace("/api/intel/assets/", ""));

      if (!ticker) {
        sendError(response, 400, "Asset ticker is required.");
        return;
      }

      try {
        const intel = await buildAssetIntel(ticker);
        sendJson(response, 200, {
          ok: true,
          intel
        });
      } catch (error) {
        sendError(
          response,
          400,
          error instanceof Error ? error.message : "Asset intel lookup failed."
        );
      }

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
        let pipelineResult = null;
        let pipelineWarning = "";

        try {
          pipelineResult = await executePipelineJob({
            trigger: "source-create",
            reason: source.id
          });
        } catch (error) {
          pipelineWarning = formatBootstrapError(error);
        }

        sendJson(response, 201, {
          ok: true,
          source,
          pipelineJobId: pipelineResult?.jobId || "",
          pipelineRunId: pipelineResult?.run?.id || "",
          pipelineWarning
        });
        return;
      }
    }

    if (requestUrl.pathname === "/api/operator/profile") {
      if (request.method === "GET") {
        sendJson(response, 200, {
          ok: true,
          profile: readFinancialProfile()
        });
        return;
      }

      if (request.method === "PUT") {
        const payload = await readJsonBody(request);
        const profile = updateFinancialProfile(payload);
        sendJson(response, 200, {
          ok: true,
          profile
        });
        return;
      }
    }

    if (requestUrl.pathname === "/api/operator/paper-trades") {
      if (request.method === "GET") {
        const paperTradeWorkspace = await getPaperTradeMarkWorkspace({
          tickers: listPaperTrades()
            .filter((trade) => ["planned", "open"].includes(String(trade.status || "").trim().toLowerCase()))
            .map((trade) => trade.asset)
        });

        sendJson(response, 200, {
          ok: true,
          ...buildStoredPaperTradingState({
            marketSnapshot: paperTradeWorkspace.marketSnapshot,
            markProvider: paperTradeWorkspace.markProvider
          })
        });
        return;
      }

      if (request.method === "POST") {
        const payload = await readJsonBody(request);
        const decisionId = String(payload.decisionId || "").trim();

        if (!decisionId) {
          sendError(response, 400, "decisionId is required.");
          return;
        }

        const decisionEntry = getDecisionHistoryEntry(decisionId);

        if (!decisionEntry) {
          sendError(response, 404, "Decision history entry not found.");
          return;
        }

        const review = getDecisionReviewByAsset(decisionEntry.asset);

        if (review?.status !== "approved") {
          sendError(
            response,
            400,
            "Approve the current decision before opening a paper trade."
          );
          return;
        }

        try {
          derivePaperTradeSide(decisionEntry.action);
        } catch (error) {
          sendError(
            response,
            400,
            error instanceof Error ? error.message : "Paper trade side could not be derived."
          );
          return;
        }

        const existingTrade = findActivePaperTradeByDecisionId(decisionId, {
          marketSnapshot: getLatestMarketSnapshot()
        });

        if (existingTrade) {
          sendError(
            response,
            400,
            "An active paper trade already exists for this decision."
          );
          return;
        }

        try {
          const paperTradeWorkspace = await getPaperTradeMarkWorkspace({
            tickers: [decisionEntry.asset]
          });
          const marketSnapshot = paperTradeWorkspace.marketSnapshot;
          const entrySeed = resolvePaperTradeEntryPrice(payload, decisionEntry, marketSnapshot);
          const trade = createPaperTrade({
            decisionId: decisionEntry.id,
            reviewId: review?.id || "",
            asset: decisionEntry.asset,
            decisionAction: decisionEntry.action,
            reviewStatus: review?.status || "",
            side: derivePaperTradeSide(decisionEntry.action),
            status: payload.status || "open",
            openedAt: payload.openedAt || new Date().toISOString(),
            thesis: payload.thesis || decisionEntry.summary || "",
            horizon: payload.horizon || decisionEntry.horizon || "",
            invalidationReason: payload.invalidationReason || "",
            notes: payload.notes || "",
            postmortem: payload.postmortem || "",
            entryPrice: entrySeed.price,
            entryPriceSource: payload.entryPriceSource || entrySeed.source,
            entryPriceAsOf: payload.entryPriceAsOf || entrySeed.asOf,
            positionSizeUsd: payload.positionSizeUsd || 1000,
            feesUsd: payload.feesUsd || 0,
            slippageBps: payload.slippageBps || 0,
            plannedStopPrice: payload.plannedStopPrice,
            plannedTargetPrice: payload.plannedTargetPrice,
            manualMarkPrice: payload.manualMarkPrice,
            manualMarkAsOf: payload.manualMarkAsOf,
            exitPrice: payload.exitPrice,
            exitPriceAsOf: payload.exitPriceAsOf
          });

          sendJson(response, 201, {
            ok: true,
            trade: getPaperTrade(trade.id, {
              marketSnapshot
            }),
            markProvider: paperTradeWorkspace.markProvider
          });
        } catch (error) {
          sendError(
            response,
            400,
            error instanceof Error ? error.message : "Paper trade create failed."
          );
        }

        return;
      }
    }

    if (requestUrl.pathname === "/api/operator/research") {
      if (request.method === "GET") {
        const researchState = buildResearchDashboardState();
        sendJson(response, 200, {
          ok: true,
          statuses: RESEARCH_DOSSIER_STATUSES,
          ...researchState
        });
        return;
      }

      if (request.method === "POST") {
        const payload = await readJsonBody(request);

        try {
          const dossier = createResearchDossier(payload);
          sendJson(response, 201, {
            ok: true,
            dossier
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Research dossier create failed.";
          sendError(response, 400, message);
        }

        return;
      }

      if (request.method === "PUT") {
        const payload = await readJsonBody(request);

        try {
          const seedResult = await seedResearchDossiersFromLiveQueue({
            assets: payload.assets,
            missingOnly: payload.missingOnly !== false
          });
          sendJson(response, 200, {
            ok: true,
            ...seedResult
          });
        } catch (error) {
          sendError(
            response,
            400,
            error instanceof Error ? error.message : "Research dossier seed failed."
          );
        }

        return;
      }
    }

    if (requestUrl.pathname === "/api/operator/decision-reviews" && request.method === "GET") {
      sendJson(response, 200, {
        ok: true,
        statuses: DECISION_REVIEW_STATUSES,
        reviews: listDecisionReviews(24)
      });
      return;
    }

    if (requestUrl.pathname === "/api/operator/manual-feed/import" && request.method === "POST") {
      const payload = await readJsonBody(request);
      const importedPosts = parseManualImportText(payload.rawText);

      if (!importedPosts.length) {
        sendError(
          response,
          400,
          "Paste at least one post. Use a blank line between posts, or prefix a post with an ISO timestamp followed by |."
        );
        return;
      }

      const source = resolveManualImportSource(payload);
      const store = importManualPosts({
        sourceId: source.id,
        posts: importedPosts,
        replaceExisting: payload.replaceExisting !== false
      });

      sendJson(response, 200, {
        ok: true,
        source,
        importedCount: importedPosts.length,
        feedMode: store.mode,
        seededAt: store.seededAt
      });
      return;
    }

    if (requestUrl.pathname === "/api/advisor/history" && request.method === "GET") {
      sendJson(response, 200, {
        ok: true,
        answers: listAdvisorAnswers(20)
      });
      return;
    }

    if (requestUrl.pathname === "/api/advisor/portfolio-assessment" && request.method === "GET") {
      const persistedState = await getPersistedAppState();
      sendJson(response, 200, {
        ok: true,
        assessment: persistedState.appData?.advisor?.portfolioAssessment || null
      });
      return;
    }

    if (requestUrl.pathname === "/api/advisor/ask" && request.method === "POST") {
      const payload = await readJsonBody(request);
      const answer = await answerFinancialQuestion({
        assetTicker: payload.assetTicker,
        question: payload.question
      });
      sendJson(response, 200, {
        ok: true,
        answer
      });
      return;
    }

    if (requestUrl.pathname === "/api/polymarket/status" && request.method === "GET") {
      sendJson(response, 200, {
        ok: true,
        ...(await getPolymarketStatus())
      });
      return;
    }

    if (requestUrl.pathname === "/api/polymarket/markets" && request.method === "GET") {
      const limit = Number(requestUrl.searchParams.get("limit") || 24);
      const activeParam = requestUrl.searchParams.get("active");
      const closedParam = requestUrl.searchParams.get("closed");
      const result = await getPolymarketMarkets({
        search: String(requestUrl.searchParams.get("search") || "").trim(),
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(60, Math.round(limit)) : 24,
        active:
          activeParam == null || activeParam === ""
            ? true
            : activeParam === "1" || activeParam === "true",
        closed: closedParam === "1" || closedParam === "true"
      });

      sendJson(response, 200, {
        ok: true,
        ...result
      });
      return;
    }

    if (requestUrl.pathname === "/api/polymarket/analyse" && request.method === "POST") {
      const payload = await readJsonBody(request);

      if (!String(payload.marketId || payload.marketSlug || "").trim()) {
        sendError(response, 400, "marketId or marketSlug is required.");
        return;
      }

      const result = await analyzePolymarketBet({
        marketId: String(payload.marketId || "").trim(),
        marketSlug: String(payload.marketSlug || "").trim(),
        preferredOutcome: String(payload.preferredOutcome || "").trim(),
        thesisNote: String(payload.thesisNote || "").trim(),
        maxRiskUsd: Number(payload.maxRiskUsd || 25),
        trigger: String(payload.trigger || "ui").trim() || "ui"
      });

      sendJson(response, 201, {
        ok: true,
        ...result
      });
      return;
    }

    if (requestUrl.pathname === "/api/polymarket/orders" && request.method === "POST") {
      const payload = await readJsonBody(request);
      const result = await placePolymarketOrder({
        analysisId: String(payload.analysisId || "").trim(),
        marketId: String(payload.marketId || "").trim(),
        marketSlug: String(payload.marketSlug || "").trim(),
        outcomeName: String(payload.outcomeName || "").trim(),
        price: Number(payload.price),
        size: Number(payload.size),
        side: String(payload.side || "BUY").trim(),
        orderType: String(payload.orderType || "GTC").trim(),
        trigger: String(payload.trigger || "ui").trim() || "ui"
      });

      sendJson(response, 201, {
        ok: true,
        ...result
      });
      return;
    }

    if (requestUrl.pathname.startsWith("/api/operator/research/")) {
      const dossierId = decodeURIComponent(requestUrl.pathname.replace("/api/operator/research/", ""));

      if (!dossierId) {
        sendError(response, 400, "Research dossier id is required.");
        return;
      }

      if (request.method === "GET") {
        const dossier = getResearchDossier(dossierId);

        if (!dossier) {
          sendError(response, 404, "Research dossier not found.");
          return;
        }

        sendJson(response, 200, {
          ok: true,
          dossier
        });
        return;
      }

      if (request.method === "PUT") {
        const payload = await readJsonBody(request);

        try {
          const dossier = updateResearchDossier(dossierId, payload);
          sendJson(response, 200, {
            ok: true,
            dossier
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Research dossier update failed.";
          sendError(response, message === "Research dossier not found." ? 404 : 400, message);
        }

        return;
      }

      if (request.method === "DELETE") {
        try {
          const dossier = deleteResearchDossier(dossierId);
          sendJson(response, 200, {
            ok: true,
            dossier
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Research dossier delete failed.";
          sendError(response, message === "Research dossier not found." ? 404 : 400, message);
        }

        return;
      }
    }

    if (requestUrl.pathname.startsWith("/api/operator/decision-reviews/")) {
      const reviewId = decodeURIComponent(
        requestUrl.pathname.replace("/api/operator/decision-reviews/", "")
      );

      if (!reviewId) {
        sendError(response, 400, "Decision review id is required.");
        return;
      }

      if (request.method === "PUT") {
        const payload = await readJsonBody(request);
        const status = String(payload.status || "proposed").trim().toLowerCase();

        if (!DECISION_REVIEW_STATUSES.includes(status)) {
          sendError(
            response,
            400,
            `status must be one of: ${DECISION_REVIEW_STATUSES.join(", ")}.`
          );
          return;
        }

        try {
          const review = updateDecisionReviewStatus({
            reviewId,
            status,
            note: payload.note
          });

          sendJson(response, 200, {
            ok: true,
            review
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Decision review update failed.";
          sendError(response, message === "Decision review not found." ? 404 : 400, message);
        }

        return;
      }
    }

    if (requestUrl.pathname.startsWith("/api/operator/decision-history/")) {
      const entryId = decodeURIComponent(
        requestUrl.pathname.replace("/api/operator/decision-history/", "")
      );

      if (!entryId) {
        sendError(response, 400, "Decision history id is required.");
        return;
      }

      if (request.method === "PUT") {
        const payload = await readJsonBody(request);
        const followUpState = String(payload.followUpState || "").trim().toLowerCase();

        if (followUpState && !DECISION_FOLLOW_UP_STATES.includes(followUpState)) {
          sendError(
            response,
            400,
            `followUpState must be one of: ${DECISION_FOLLOW_UP_STATES.join(", ")}.`
          );
          return;
        }

        try {
          const entry = updateDecisionHistoryEntry(entryId, {
            followUpState,
            nextReviewAt: payload.nextReviewAt,
            outcomeNote: payload.outcomeNote,
            invalidationReason: payload.invalidationReason,
            postmortem: payload.postmortem
          });

          sendJson(response, 200, {
            ok: true,
            entry
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Decision history update failed.";
          sendError(response, message === "Decision history entry not found." ? 404 : 400, message);
        }

        return;
      }
    }

    if (requestUrl.pathname.startsWith("/api/operator/paper-trades/")) {
      const tradeId = decodeURIComponent(
        requestUrl.pathname.replace("/api/operator/paper-trades/", "")
      );

      if (!tradeId) {
        sendError(response, 400, "Paper trade id is required.");
        return;
      }

      if (request.method === "GET") {
        const storedTrade = getPaperTrade(tradeId);

        if (!storedTrade) {
          sendError(response, 404, "Paper trade not found.");
          return;
        }

        const paperTradeWorkspace = await getPaperTradeMarkWorkspace({
          tickers: [storedTrade.asset]
        });
        const trade = getPaperTrade(tradeId, {
          marketSnapshot: paperTradeWorkspace.marketSnapshot
        });

        sendJson(response, 200, {
          ok: true,
          trade,
          markProvider: paperTradeWorkspace.markProvider
        });
        return;
      }

      if (request.method === "PUT") {
        const payload = await readJsonBody(request);

        try {
          const trade = updatePaperTrade(tradeId, payload);
          const paperTradeWorkspace = await getPaperTradeMarkWorkspace({
            tickers: [trade.asset]
          });

          sendJson(response, 200, {
            ok: true,
            trade: getPaperTrade(trade.id, {
              marketSnapshot: paperTradeWorkspace.marketSnapshot
            }),
            markProvider: paperTradeWorkspace.markProvider
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Paper trade update failed.";
          sendError(response, message === "Paper trade not found." ? 404 : 400, message);
        }

        return;
      }
    }

    if (requestUrl.pathname.startsWith("/api/operator/post-verification-overrides/")) {
      const postId = decodeURIComponent(
        requestUrl.pathname.replace("/api/operator/post-verification-overrides/", "")
      );

      if (!postId) {
        sendError(response, 400, "Post id is required.");
        return;
      }

      if (request.method === "GET") {
        sendJson(response, 200, {
          ok: true,
          override: getPostVerificationOverride(postId)
        });
        return;
      }

      if (request.method === "PUT") {
        const payload = await readJsonBody(request);
        const enabled = payload.enabled !== false;
        const override = setPostVerificationOverride({
          postId,
          enabled,
          note: String(payload.note || "").trim()
        });
        const pipelineResult = await executePipelineJob({
          trigger: enabled ? "verification-override-enable" : "verification-override-clear",
          reason: postId
        });

        sendJson(response, 200, {
          ok: true,
          override,
          pipelineJobId: pipelineResult.jobId,
          pipelineRunId: pipelineResult.run.id
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
        let pipelineResult = null;
        let pipelineWarning = "";

        try {
          pipelineResult = await executePipelineJob({
            trigger: "source-update",
            reason: source.id
          });
        } catch (error) {
          pipelineWarning = formatBootstrapError(error);
        }

        sendJson(response, 200, {
          ok: true,
          source,
          pipelineJobId: pipelineResult?.jobId || "",
          pipelineRunId: pipelineResult?.run?.id || "",
          pipelineWarning
        });
        return;
      }

      if (request.method === "DELETE") {
        if (hasTweetsForSource(sourceId)) {
          sendError(response, 409, "Delete or reassign tweets for this source before removing it.");
          return;
        }

        deleteSource(sourceId);
        let pipelineResult = null;
        let pipelineWarning = "";

        try {
          pipelineResult = await executePipelineJob({
            trigger: "source-delete",
            reason: sourceId
          });
        } catch (error) {
          pipelineWarning = formatBootstrapError(error);
        }

        sendJson(response, 200, {
          ok: true,
          pipelineJobId: pipelineResult?.jobId || "",
          pipelineRunId: pipelineResult?.run?.id || "",
          pipelineWarning
        });
        return;
      }
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/admin/run-pipeline") {
      const payload = await readJsonBody(request);
      const pipelineResult = await executePipelineJob({
        trigger: "manual-admin",
        reason: String(payload.reason || "").trim()
      });
      sendJson(response, 200, {
        ok: true,
        jobId: pipelineResult.jobId,
        runId: pipelineResult.run.id,
        summary: pipelineResult.run.summary
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
      reseedTweetStore(140);
      const pipelineResult = await executePipelineJob({
        trigger: "reseed-fake-feed"
      });
      sendJson(response, 200, {
        ok: true,
        message: "Fake tweets reseeded and pipeline rerun",
        jobId: pipelineResult.jobId,
        runId: pipelineResult.run.id,
        status: pipelineResult.run.snapshot.storeStatus
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/admin/runtime/pause") {
      stopBackgroundPipelineRunner();
      stopManualFeedCronRunner();
      sendJson(response, 200, {
        ok: true,
        scheduler: getBackgroundPipelineStatus(),
        manualFeedCron: getManualFeedCronStatus()
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/admin/runtime/resume") {
      const payload = await readJsonBody(request);
      const scheduler = startBackgroundPipelineRunner({
        intervalMinutes:
          payload.intervalMinutes ?? process.env.PIPELINE_INTERVAL_MINUTES ?? 15,
        scheduleTimes:
          payload.scheduleTimes ?? process.env.PIPELINE_SCHEDULE_TIMES ?? "",
        timezone:
          payload.timezone ?? process.env.PIPELINE_SCHEDULE_TIMEZONE
      });
      const manualFeedCron = startManualFeedCronRunner({
        intervalHours:
          payload.manualFeedCronIntervalHours ?? getManualFeedCronConfig().intervalHours,
        maxPostAgeHours:
          payload.manualFeedCronMaxPostAgeHours ?? getManualFeedCronConfig().maxPostAgeHours
      });
      sendJson(response, 200, {
        ok: true,
        scheduler,
        manualFeedCron
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/admin/runtime/send-digest") {
      const payload = await readJsonBody(request);
      const digestResult = await sendDailyDigest({
        trigger: "manual-admin",
        reason: String(payload.reason || "").trim()
      });
      sendJson(response, 200, {
        ok: true,
        jobId: digestResult.jobId,
        notificationId: digestResult.notificationEvent?.id || "",
        digest: digestResult.digest
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/admin/runtime/test-notification") {
      const payload = await readJsonBody(request);
      const notificationStatus = getNotificationStatus();
      const notificationEvent = await sendNotification({
        eventType: "operator.test",
        message: {
          title: "Operator test notification",
          summary: String(payload.summary || "Telegram notifications are connected to the runtime."),
          facts: [
            {
              label: "Provider",
              value: notificationStatus.config.activeProvider
            },
            {
              label: "Timestamp",
              value: new Date().toISOString()
            }
          ],
          footer: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to deliver this over Telegram."
        },
        payload: {
          source: "manual-test"
        }
      });
      sendJson(response, 200, {
        ok: true,
        notificationEvent
      });
      return;
    }
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    sendError(response, statusCode, message);
    return;
  }

  const staticPath = requestUrl.pathname === "/linkedin-composer" ? "/linkedin-composer.html" : requestUrl.pathname;
  const filePath = resolvePath(staticPath);

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
    let startupWarning = "";

    try {
      await ensureBootstrap();
    } catch (error) {
      startupWarning = formatBootstrapError(error);
    }

    startBackgroundPipelineRunner();
    startManualFeedCronRunner();
    await startTelegramBotRunner();

    if (startupWarning) {
      console.warn(`Startup refresh failed: ${startupWarning}`);
    } else if (getBootstrapStatus().status === "degraded" && getBootstrapStatus().lastError) {
      console.warn(`Startup refresh degraded: ${getBootstrapStatus().lastError}`);
    }

    console.log(`x-ticker-investment running on http://${host}:${port}`);
  });
