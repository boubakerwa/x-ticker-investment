const EMPTY_DATA = {
  metadata: {
    snapshotLabel: "Loading snapshot",
    universeFocus: "",
    latencyWindow: "",
    generatedAt: "",
    tweetFeedMode: "",
    tweetFeedCount: 0,
    extractorMode: "",
    extractorModel: ""
  },
  engine: {
    mode: "",
    generatedAt: "",
    extractor: {
      requestedMode: "",
      activeMode: "",
      provider: "",
      model: "",
      cacheHits: 0,
      liveExtractions: 0,
      cacheWrites: 0,
      fallbackCount: 0
    },
    summary: {
      claimCount: 0,
      actionableCount: 0,
      clusterCount: 0,
      decisionCount: 0,
      vetoCount: 0,
      sourceCount: 0,
      verificationBlockedCount: 0,
      verificationCorroboratedCount: 0,
      verificationOverrideCount: 0,
      newestPostAt: "",
      oldestPostAt: ""
    },
    stages: [],
    notes: []
  },
  runtime: {
    bootstrap: {
      status: "",
      lastAttemptAt: "",
      lastSuccessAt: "",
      lastError: "",
      fallbackSnapshotRunId: "",
      usingFallbackSnapshot: false
    },
    scheduler: {
      active: false,
      running: false,
      mode: "",
      intervalMinutes: 0,
      scheduleTimes: [],
      timezone: "",
      scheduleDescription: "",
      startedAt: "",
      nextRunAt: "",
      lastRunAt: "",
      lastRunId: "",
      lastError: ""
    }
  },
  monitoredUniverse: [],
  sources: [],
  posts: [],
  clusters: [],
  decisions: [],
  vetoedSignals: [],
  history: {
    latestRunId: "",
    runs: [],
    decisionLog: []
  },
  evaluation: {
    latestRun: null,
    history: []
  },
  research: {
    summary: {
      totalCount: 0,
      dossierCount: 0,
      candidateCount: 0,
      approvedCount: 0,
      dismissedCount: 0,
      expiredCount: 0,
      activeThemeCount: 0,
      averageSourceQualityScore: 0,
      averageTimelinessScore: 0,
      nextDossierId: ""
    },
    dossiers: [],
    scorecards: [],
    inbox: []
  },
  reviews: {
    summary: {
      totalCount: 0,
      proposedCount: 0,
      approvedCount: 0,
      dismissedCount: 0,
      reviewedCount: 0,
      nextDecisionId: ""
    },
    queue: [],
    current: [],
    recent: []
  },
  advisor: {
    financialProfile: {
      investorName: "",
      riskTolerance: "Moderate",
      investmentHorizon: "",
      liquidityNeeds: "",
      watchlist: [],
      monthlyNetIncome: 0,
      monthlyExpenses: 0,
      emergencyFund: 0,
      targetEmergencyFundMonths: 6,
      goals: [],
      notes: "",
      holdings: [],
      retirementProducts: [],
      liabilities: [],
      documents: []
    },
    history: []
  },
  ingestion: null,
  market: null,
  placeholders: {
    decisionLogs: [],
    simulationRuns: []
  },
  pipeline: []
};

const EMPTY_STORE_STATUS = {
  mode: "",
  seededAt: "",
  postCount: 0,
  newestPostAt: "",
  oldestPostAt: "",
  sourcesCovered: 0,
  clustersCovered: 0,
  engineMode: "",
  extractorMode: "",
  extractorModel: "",
  actionableCount: 0,
  decisionCount: 0,
  vetoCount: 0,
  bySource: [],
  byCluster: []
};

const DEFAULT_TEST_DRAFT = {
  sourceId: "",
  sourceHandle: "@testbench",
  sourceName: "Ad hoc test source",
  sourceCategory: "Test / Ad hoc",
  allowedAssets: "",
  relevantSectors: "",
  rawText: "",
  runLive: true
};

const DEVELOPER_STORAGE_KEY = "xTickerDeveloperMode";

const state = {
  view: "dashboard",
  developerMode: readDeveloperModeSetting(),
  selectedAsset: "",
  selectedSource: "",
  selectedReplayPostId: "",
  selectedRunId: "",
  selectedEvalId: "",
  editingSourceId: "",
  editingResearchId: "",
  actionFilter: "ALL",
  isLoading: true,
  isRefreshing: false,
  isReseeding: false,
  isRunningPipeline: false,
  isRunningEvals: false,
  isSendingDigest: false,
  isTestingNotification: false,
  isSavingProfile: false,
  isAskingAdvisor: false,
  isMutating: false,
  isReplayLoading: false,
  isTestRunLoading: false,
  isRunDetailLoading: false,
  isEvalDetailLoading: false,
  error: "",
  replayError: "",
  testRunError: "",
  runDetailError: "",
  evalDetailError: "",
  operatorNotice: "",
  advisorNotice: "",
  advisorError: "",
  profileOnboardingStep: 0,
  profileDocumentDraft: [],
  profileDraft: null,
  data: EMPTY_DATA,
  recentTweets: [],
  replayData: null,
  testDraft: { ...DEFAULT_TEST_DRAFT },
  testRunData: null,
  selectedRunDetail: null,
  selectedEvalDetail: null,
  advisorAnswer: null,
  storeStatus: EMPTY_STORE_STATUS
};

const app = document.querySelector("#app");
const actionFilters = ["ALL", "BUY", "HOLD", "SELL"];
const DEVELOPER_VIEWS = ["admin", "tests", "sources", "logs", "docs"];
const DECISIONS_VIEWS = ["decisions", "research", "assets"];
const PRIMARY_VIEWS = ["dashboard", "setup", "signals", "decisions", "advisor"];
const docsPrinciples = [
  {
    title: "Bounded agents, not free-form autonomy",
    body: "LLMs interpret claims and narratives, but deterministic layers decide what can actually influence the book."
  },
  {
    title: "Events matter more than single tweets",
    body: "Repeated aligned posts get clustered into one narrative object so the system reacts to signal convergence, not isolated noise."
  },
  {
    title: "Explainability is mandatory",
    body: "Every output should say why it is BUY, HOLD, or SELL, why it is not something else, and what uncertainty remains."
  }
];
const docsHardChecks = [
  "Is the source allowed and credible enough for this type of claim?",
  "Is the content actionable or just commentary?",
  "Does it map to an approved asset in the curated universe?",
  "Is the event still fresh, or has it become repetitive and stale?",
  "Does market context confirm or contradict the social signal?",
  "Should policy or veto logic downgrade the candidate before it reaches the decision book?"
];
const adminRoadmap = [
  "Persisted pipeline snapshots with run history and replayable decision logs",
  "Offline extraction eval harness for prompt and policy regression tracking",
  "Raw-ingestion contract with dedupe, source watermarks, and normalized-post versions",
  "Market-context enrichment feeding the deterministic decision policy"
];

function readStoredFlag(storageKey, fallback = false) {
  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (rawValue === "1") {
      return true;
    }

    if (rawValue === "0") {
      return false;
    }
  } catch (_error) {
    return fallback;
  }

  return fallback;
}

function persistStoredFlag(storageKey, enabled) {
  try {
    window.localStorage.setItem(storageKey, enabled ? "1" : "0");
  } catch (_error) {
    return;
  }
}

function readDeveloperModeSetting() {
  return readStoredFlag(DEVELOPER_STORAGE_KEY, false);
}

const getData = () => state.data || EMPTY_DATA;
const getStoreStatus = () => state.storeStatus || EMPTY_STORE_STATUS;
const getEngine = () => getData().engine || EMPTY_DATA.engine;
const getHistory = () => getData().history || EMPTY_DATA.history;
const getEvaluation = () => getData().evaluation || EMPTY_DATA.evaluation;
const getResearch = () => getData().research || EMPTY_DATA.research;
const getReviews = () => getData().reviews || EMPTY_DATA.reviews;
const getAdvisor = () => getData().advisor || EMPTY_DATA.advisor;
const getRuntime = () => getData().runtime || EMPTY_DATA.runtime;
const isDeveloperView = (view = state.view) => DEVELOPER_VIEWS.includes(view);
const isDecisionsView = (view = state.view) => DECISIONS_VIEWS.includes(view);
const isPrimaryView = (view = state.view) => PRIMARY_VIEWS.includes(view);
const getPrimaryView = (view = state.view) =>
  isDecisionsView(view) ? "decisions" : isPrimaryView(view) ? view : "";
const formatPercent = (value) => `${Math.round(value * 100)}%`;
const formatScorePercent = (value) => `${Math.round((value || 0) * 100)}%`;
const formatSignedReturn = (value) =>
  value == null ? "Pending" : `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
const formatContextLabel = (value) =>
  value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
const sortPostsByCreatedAt = (items) =>
  [...items].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
const formatListValue = (items) => (Array.isArray(items) ? items.join(", ") : "");
const formatEnumLabel = (value) =>
  String(value || "unknown")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
const formatShortId = (value) => String(value || "").slice(0, 18) || "Pending";
const getEvalMode = (run) => String(run?.extractor?.activeMode || run?.validationMode || run?.model?.provider || "model");

function formatRatio(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "Pending";
  }

  return `${numericValue.toFixed(1)}x`;
}

function formatProbability(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "Pending";
  }

  if (numericValue > 1 && numericValue <= 100) {
    return `${Math.round(numericValue)}%`;
  }

  return `${Math.round(numericValue * 100)}%`;
}

function formatDecisionMathValue(value, { ratio = false, probability = false } = {}) {
  if (value == null || value === "") {
    return "Pending";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatDecisionMathValue(item, { ratio, probability })).join(" - ");
  }

  if (typeof value === "object") {
    const rangeStart = value.low ?? value.min ?? value.lower ?? value.from;
    const rangeEnd = value.high ?? value.max ?? value.upper ?? value.to;

    if (rangeStart != null || rangeEnd != null) {
      const left = rangeStart != null ? formatDecisionMathValue(rangeStart, { ratio, probability }) : "Pending";
      const right = rangeEnd != null ? formatDecisionMathValue(rangeEnd, { ratio, probability }) : "Pending";
      return `${left} - ${right}`;
    }

    return value.label || value.text || value.summary || value.note || JSON.stringify(value);
  }

  if (ratio) {
    return formatRatio(value);
  }

  if (probability) {
    return formatProbability(value);
  }

  return formatSignedReturn(value);
}

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function normalizeTickerList(items) {
  return [...new Set((items || []).map((item) => normalizeTicker(item)).filter(Boolean))];
}

function buildTrackedSourceLabel({ isHolding = false, isWatchlist = false } = {}) {
  if (isHolding && isWatchlist) {
    return "Portfolio + watchlist";
  }

  if (isHolding) {
    return "Portfolio holding";
  }

  if (isWatchlist) {
    return "Watchlist";
  }

  return "";
}

function buildWatchedUniverseAsset(ticker, baseAsset, holding, isWatchlist) {
  const normalizedTicker = normalizeTicker(ticker);

  if (!normalizedTicker) {
    return null;
  }

  const isHolding = Boolean(holding);
  const trackingLabel = buildTrackedSourceLabel({ isHolding, isWatchlist });
  const personalNotes = String(holding?.notes || "").trim();
  const personalCategory = String(holding?.category || "").trim();
  const personalLabel = String(holding?.label || "").trim();
  const personalAssetCopy = isHolding
    ? "This asset comes from your saved portfolio."
    : "This asset comes from your saved watchlist.";
  const personalNotesCopy = personalNotes
    ? personalNotes
    : `${personalAssetCopy} Add a short note in Portfolio to improve automated impact mapping.`;

  return {
    ...(baseAsset || {}),
    ticker: normalizedTicker,
    name: baseAsset?.name || personalLabel || normalizedTicker,
    type: baseAsset?.type || personalCategory || "Custom tracked asset",
    bucket: baseAsset?.bucket || trackingLabel || "Tracked asset",
    thesis: baseAsset?.thesis || personalNotesCopy,
    riskFlag:
      baseAsset?.riskFlag ||
      (personalNotes
        ? "Impact ranking uses your saved notes plus the live post narrative."
        : "No curated metadata yet. Add a short note in Portfolio to improve automated impact mapping."),
    isCurated: Boolean(baseAsset),
    isTracked: isHolding || isWatchlist,
    isHolding,
    isWatchlist,
    trackingLabel,
    personalLabel,
    personalCategory,
    personalNotes
  };
}

function buildProfileCashSummary(profile) {
  const monthlyExpenses = Number(profile.monthlyExpenses || 0);
  const emergencyFund = Number(profile.emergencyFund || 0);
  const emergencyCoverageMonths =
    monthlyExpenses > 0 ? Number((emergencyFund / monthlyExpenses).toFixed(1)) : 0;

  return {
    emergencyCoverageMonths,
    monthlyBurn: Math.max(0, Number(profile.monthlyExpenses || 0) - Number(profile.monthlyNetIncome || 0))
  };
}

function getTrackedAssetTickers(profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile) {
  return normalizeTickerList([
    ...(profile.holdings || []).map((holding) => holding.ticker),
    ...(profile.watchlist || [])
  ]);
}

function getWatchedUniverse(profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile) {
  const baseUniverse = Array.isArray(getData().monitoredUniverse) ? getData().monitoredUniverse : [];
  const trackedTickers = getTrackedAssetTickers(profile);
  const holdingsByTicker = new Map(
    (profile.holdings || [])
      .map((holding) => [normalizeTicker(holding.ticker), holding])
      .filter(([ticker]) => ticker)
  );
  const watchlistSet = new Set(normalizeTickerList(profile.watchlist || []));
  const baseByTicker = new Map(
    baseUniverse
      .map((asset) => [normalizeTicker(asset.ticker), asset])
      .filter(([ticker]) => ticker)
  );
  const watchedUniverse = [];
  const seen = new Set();

  trackedTickers.forEach((ticker) => {
    const watchedAsset = buildWatchedUniverseAsset(
      ticker,
      baseByTicker.get(ticker) || null,
      holdingsByTicker.get(ticker) || null,
      watchlistSet.has(ticker)
    );

    if (watchedAsset && !seen.has(ticker)) {
      watchedUniverse.push(watchedAsset);
      seen.add(ticker);
    }
  });

  baseUniverse.forEach((asset) => {
    const ticker = normalizeTicker(asset.ticker);

    if (!ticker || seen.has(ticker)) {
      return;
    }

    const watchedAsset = buildWatchedUniverseAsset(
      ticker,
      asset,
      holdingsByTicker.get(ticker) || null,
      watchlistSet.has(ticker)
    );

    if (watchedAsset) {
      watchedUniverse.push(watchedAsset);
      seen.add(ticker);
    }
  });

  return watchedUniverse;
}

function getPostExposureTickers(
  post,
  profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile
) {
  return normalizeTickerList([
    ...(Array.isArray(post?.mappedAssets) ? post.mappedAssets : []),
    ...getLikelyImpacts(post, profile).map((impact) => impact.asset)
  ]);
}

function getTrackedAssets(profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile) {
  const trackedTickers = getTrackedAssetTickers(profile);
  const watchedUniverse = getWatchedUniverse(profile);

  return trackedTickers.map((ticker) => {
    const universeAsset = watchedUniverse.find((asset) => asset.ticker === ticker) || null;
    const holding = (profile.holdings || []).find((item) => normalizeTicker(item.ticker) === ticker) || null;
    const decision = getDecisionByAsset(ticker) || null;
    const relatedPosts = sortPostsByCreatedAt(
      getData().posts.filter((post) => getPostExposureTickers(post, profile).includes(ticker))
    ).slice(0, 3);

    return {
      ticker,
      asset: universeAsset,
      holding,
      decision,
      relatedPosts
    };
  });
}

function buildTrackedPortfolioAnalytics(profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile) {
  const trackedAssets = getTrackedAssets(profile);
  const actionableAssets = trackedAssets.filter((item) => item.decision);
  const urgentAssets = actionableAssets.filter(
    (item) => item.decision.action === "SELL" || item.decision.action === "BUY"
  );
  const priorityAssets = [...trackedAssets].sort((left, right) => {
    const actionPriority = {
      SELL: 3,
      BUY: 2,
      HOLD: 1
    };
    const leftPriority = actionPriority[left.decision?.action] || 0;
    const rightPriority = actionPriority[right.decision?.action] || 0;

    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority;
    }

    return (right.decision?.confidence || 0) - (left.decision?.confidence || 0);
  });

  return {
    trackedAssets,
    actionableAssets,
    urgentAssets,
    priorityAssets
  };
}

function getReviewSummary() {
  return getReviews().summary || EMPTY_DATA.reviews.summary;
}

function getDecisionReviewQueue() {
  return getReviews().queue || [];
}

function getCurrentDecisionReviews() {
  return getReviews().current || [];
}

function getDecisionIdByAsset(ticker) {
  const latestRunId = getHistory().latestRunId || "";
  return latestRunId && ticker ? `${latestRunId}:${ticker}` : "";
}

function getCurrentDecisionReview(ticker) {
  const decisionId = getDecisionIdByAsset(ticker);
  return getCurrentDecisionReviews().find((item) => item.id === decisionId) || null;
}

function getDecisionMath(decision = null) {
  if (decision?.decisionMath) {
    return decision.decisionMath;
  }

  if (decision?.math) {
    return decision.math;
  }

  const fallbackMath = {
    thesisProbability: decision?.thesisProbability,
    uncertainty: decision?.uncertaintyScore ?? decision?.uncertaintyValue,
    expectedUpside: decision?.expectedUpside,
    expectedDownside: decision?.expectedDownside,
    rewardRisk: decision?.rewardRisk,
    sizeBand: decision?.sizeBand,
    maxLossGuardrail: decision?.maxLossGuardrail,
    decisionMathSummary: decision?.decisionMathSummary
  };

  return Object.values(fallbackMath).some((value) => value != null && value !== "")
    ? fallbackMath
    : null;
}

function getResearchDossiers() {
  const research = getResearch();
  return research.dossiers || research.items || research.queue || research.entries || [];
}

function getResearchSummary() {
  return getResearch().summary || EMPTY_DATA.research.summary;
}

function getResearchScorecards() {
  const research = getResearch();
  return research.scorecards || research.analytics || research.scorecard || [];
}

function getResearchLifecycleCounts(dossiers = getResearchDossiers()) {
  return dossiers.reduce(
    (accumulator, dossier) => {
      const status = normalizeResearchStatus(dossier?.status || dossier?.stage);
      accumulator.totalCount += 1;

      if (accumulator[`${status}Count`] != null) {
        accumulator[`${status}Count`] += 1;
      }

      return accumulator;
    },
    {
      totalCount: 0,
      discoveryCount: 0,
      candidateCount: 0,
      validatedCount: 0,
      approvedCount: 0,
      dismissedCount: 0,
      expiredCount: 0
    }
  );
}

function normalizeResearchStatus(status) {
  const normalized = String(status || "candidate")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (normalized === "draft" || normalized === "intake") {
    return "discovery";
  }

  if (normalized === "in_review" || normalized === "review") {
    return "candidate";
  }

  if (["approved", "dismissed", "expired", "candidate", "discovery", "validated", "archived"].includes(normalized)) {
    return normalized;
  }

  return "candidate";
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

function getResearchDossierById(dossierId) {
  return getResearchDossiers().find((dossier) => dossier.id === dossierId) || null;
}

function getResearchForAsset(assetTicker, decision = null) {
  const cleanTicker = normalizeTicker(assetTicker);

  if (decision?.linkedResearch) {
    return decision.linkedResearch;
  }

  return getResearchDossiers()
    .filter((dossier) => getResearchDossierAssets(dossier).includes(cleanTicker))
    .sort((left, right) => {
      const rankDifference =
        getResearchStatusRank(right?.status || right?.stage) -
        getResearchStatusRank(left?.status || left?.stage);

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return String(right?.updatedAt || "").localeCompare(String(left?.updatedAt || ""));
    })[0] || null;
}

function isResearchEligibleForReview(research) {
  const status = normalizeResearchStatus(research?.status || research?.stage);
  return status === "validated" || status === "approved";
}

function isResearchApproved(research) {
  return normalizeResearchStatus(research?.status || research?.stage) === "approved";
}

function getResearchBlockingReason(decision, research) {
  if (decision?.researchBlockingReason) {
    return decision.researchBlockingReason;
  }

  if (!research) {
    return `Capture a research dossier for ${decision?.asset || "this asset"} before it reaches the approval queue.`;
  }

  if (!isResearchEligibleForReview(research)) {
    return `${getResearchDossierHeadline(research, decision?.asset || "This thesis")} is still ${normalizeResearchStatus(
      research.status || research.stage
    )}; validate the thesis before it enters the queue.`;
  }

  return "";
}

function getResearchDossierAssets(dossier) {
  return (dossier?.assets || dossier?.assetTickers || dossier?.symbols || [])
    .map((asset) => normalizeTicker(asset))
    .filter(Boolean);
}

function getResearchEvidenceList(dossier, key) {
  return Array.isArray(dossier?.[key]) ? dossier[key] : [];
}

function getResearchDossierHeadline(dossier, fallbackLabel = "Research dossier") {
  return (
    dossier?.title ||
    dossier?.headline ||
    dossier?.theme ||
    dossier?.thesis ||
    dossier?.name ||
    fallbackLabel
  );
}

function formatEvidenceItem(item) {
  if (item == null) {
    return "";
  }

  if (typeof item === "string") {
    return item;
  }

  return item.title || item.label || item.summary || item.source || item.name || JSON.stringify(item);
}

function renderResearchEvidenceList(items, emptyCopy) {
  const cleanedItems = (items || [])
    .map(formatEvidenceItem)
    .filter(Boolean)
    .slice(0, 4);

  if (!cleanedItems.length) {
    return `<p class="subtle">${emptyCopy}</p>`;
  }

  return `<ul class="research-evidence-list">${cleanedItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderLinkedResearchCard(research, decision = null, { includeActions = true } = {}) {
  if (!research) {
    return `
      <article class="research-linked-card">
        <span class="eyebrow">Linked research</span>
        <h4>No dossier linked yet</h4>
        <p>Capture a research dossier with supporting evidence, contradictory evidence, and citations before this thesis becomes actionable.</p>
        ${
          includeActions
            ? `
              <div class="office-form-actions">
                <button class="mini-chip" data-view="decisions">Open Decisions</button>
              </div>
            `
            : ""
        }
      </article>
    `;
  }

  const researchStatus = normalizeResearchStatus(research.status || research.stage);
  const supportingCount =
    research.supportingEvidenceCount ?? getResearchEvidenceList(research, "supportingEvidence").length;
  const contradictingCount =
    research.contradictingEvidenceCount ?? getResearchEvidenceList(research, "contradictingEvidence").length;
  const citationsCount = research.citationsCount ?? getResearchEvidenceList(research, "citations").length;
  const blockingReason = getResearchBlockingReason(decision, research);

  return `
    <article class="research-linked-card">
      <div class="decision-topline">
        <strong>${escapeHtml(getResearchDossierHeadline(research))}</strong>
        ${renderLifecyclePill(researchStatus)}
      </div>
      <p>${escapeHtml(research.thesis || research.summary || "The dossier is linked, but the thesis copy is still being filled in.")}</p>
      <div class="research-linked-grid">
        <div class="math-metric">
          <span>Source quality</span>
          <strong>${formatDecisionMathValue(research.sourceQualityScore, { probability: true })}</strong>
        </div>
        <div class="math-metric">
          <span>Timeliness</span>
          <strong>${formatDecisionMathValue(research.timelinessScore, { probability: true })}</strong>
        </div>
      </div>
      <div class="research-card-meta">
        <span class="tag">${research.theme || "General"}</span>
        <span class="tag">${supportingCount} supportive</span>
        <span class="tag">${contradictingCount} conflicting</span>
        <span class="tag">${citationsCount} citations</span>
        ${research.updatedAt ? `<span class="tag">Updated ${formatGeneratedAt(research.updatedAt)}</span>` : ""}
      </div>
      ${
        blockingReason
          ? `<p class="subtle">${escapeHtml(blockingReason)}</p>`
          : `<p class="subtle">Research governance is clear enough for queue review. Approval still depends on operator judgment and sizing guardrails.</p>`
      }
      ${
        includeActions
          ? `
            <div class="office-form-actions">
              <button class="mini-chip" data-view="decisions">Open Decisions</button>
              ${
                research.assets?.[0]
                  ? `<button class="mini-chip" data-asset="${escapeHtml(String(research.assets[0]))}">Open asset</button>`
                  : ""
              }
            </div>
          `
          : ""
      }
    </article>
  `;
}

function renderLifecyclePill(status) {
  const normalized = normalizeResearchStatus(status);
  const labelMap = {
    discovery: "Discovery",
    candidate: "Candidate",
    validated: "Validated",
    approved: "Approved",
    dismissed: "Dismissed",
    expired: "Expired",
    archived: "Archived"
  };

  return `<span class="tag lifecycle-tag lifecycle-${escapeHtml(normalized)}">${labelMap[normalized] || formatEnumLabel(normalized)}</span>`;
}

function renderDecisionMathBlock(decisionMath) {
  if (!decisionMath) {
    return `
      <article class="math-card math-card-empty">
        <span class="eyebrow">Decision math</span>
        <h4>Conservative math not yet attached</h4>
        <p>Once the engine publishes thesis probability, expected upside/downside, and a guardrail, they appear here.</p>
      </article>
    `;
  }

  const probability = decisionMath.thesisProbability ?? decisionMath.probability;
  const uncertainty = decisionMath.uncertainty ?? decisionMath.confidenceInterval ?? decisionMath.confidenceBand;
  const expectedUpside = decisionMath.expectedUpside;
  const expectedDownside = decisionMath.expectedDownside;
  const rewardRisk = decisionMath.rewardRisk ?? decisionMath.rewardToRisk;
  const sizeBand = decisionMath.sizeBand ?? decisionMath.positionSizeBand ?? decisionMath.size;
  const maxLossGuardrail = decisionMath.maxLossGuardrail ?? decisionMath.maxLoss ?? decisionMath.guardrail;
  const horizon = decisionMath.horizon || decisionMath.holdingPeriod || "";

  return `
    <article class="math-card">
      <div class="section-header compact">
        <div>
          <span class="eyebrow">Decision math</span>
          <h4>Conservative sizing and payoff cues</h4>
        </div>
      </div>
      <div class="math-grid">
        <div class="math-metric">
          <span>Thesis probability</span>
          <strong>${formatDecisionMathValue(probability, { probability: true })}</strong>
        </div>
        <div class="math-metric">
          <span>Uncertainty</span>
          <strong>${formatDecisionMathValue(uncertainty, { probability: true })}</strong>
        </div>
        <div class="math-metric">
          <span>Expected upside</span>
          <strong>${formatDecisionMathValue(expectedUpside)}</strong>
        </div>
        <div class="math-metric">
          <span>Expected downside</span>
          <strong>${formatDecisionMathValue(expectedDownside)}</strong>
        </div>
        <div class="math-metric">
          <span>Reward / risk</span>
          <strong>${formatDecisionMathValue(rewardRisk, { ratio: true })}</strong>
        </div>
        <div class="math-metric">
          <span>Size band</span>
          <strong>${escapeHtml(String(sizeBand || "Pending"))}</strong>
        </div>
      </div>
      <div class="math-footer">
        <span class="pill pill-muted">Guardrail ${formatDecisionMathValue(maxLossGuardrail, { probability: true })}</span>
        ${horizon ? `<span class="pill pill-muted">${escapeHtml(String(horizon))}</span>` : ""}
      </div>
    </article>
  `;
}

function renderDecisionMathSummary(decisionMath) {
  if (!decisionMath) {
    return `<p class="subtle">Decision math pending.</p>`;
  }

  const probability = decisionMath.thesisProbability ?? decisionMath.probability;
  const rewardRisk = decisionMath.rewardRisk ?? decisionMath.rewardToRisk;
  const sizeBand = decisionMath.sizeBand ?? decisionMath.positionSizeBand ?? decisionMath.size;
  const guardrail = decisionMath.maxLossGuardrail ?? decisionMath.maxLoss ?? decisionMath.guardrail;

  return `
    <div class="decision-math-summary">
      <span class="tag">P ${formatDecisionMathValue(probability, { probability: true })}</span>
      <span class="tag">RR ${formatDecisionMathValue(rewardRisk, { ratio: true })}</span>
      <span class="tag">${escapeHtml(String(sizeBand || "Size pending"))}</span>
      <span class="tag">Guardrail ${formatDecisionMathValue(guardrail, { probability: true })}</span>
    </div>
  `;
}

function renderResearchDossierCard(dossier) {
  const status = normalizeResearchStatus(dossier?.status || dossier?.stage);
  const assets = getResearchDossierAssets(dossier);
  const evidenceQuality = dossier?.sourceQualityScore ?? dossier?.sourceQuality ?? dossier?.qualityScore;
  const timeliness = dossier?.timelinessScore ?? dossier?.freshnessScore ?? dossier?.timeliness;
  const linkedClusters = Array.isArray(dossier?.linkedClusterIds) ? dossier.linkedClusterIds : dossier?.clusterIds || [];
  const riskFactors = Array.isArray(dossier?.riskFactors) ? dossier.riskFactors : [];
  const citations = getResearchEvidenceList(dossier, "citations");

  return `
    <article class="research-card ${status === "approved" ? "is-approved" : status === "dismissed" ? "is-dismissed" : "is-candidate"}">
      <div class="research-card-head">
        <div>
          <div class="decision-topline">
            <strong>${escapeHtml(getResearchDossierHeadline(dossier))}</strong>
            ${renderLifecyclePill(status)}
          </div>
          <p>${escapeHtml(dossier?.thesis || dossier?.summary || dossier?.description || "No thesis summary provided yet.")}</p>
        </div>
        ${
          assets[0]
            ? `<button class="mini-chip" type="button" data-asset="${escapeHtml(String(assets[0]))}">Open lead asset</button>`
            : `<button class="mini-chip" type="button" data-view="decisions">Open Decisions</button>`
        }
      </div>
      <div class="research-card-meta">
        <span class="tag">${escapeHtml(String(dossier?.theme || dossier?.category || "General"))}</span>
        <span class="tag">${assets.length ? `${assets.length} assets` : "No assets linked"}</span>
        <span class="tag">${linkedClusters.length ? `${linkedClusters.length} clusters` : "No clusters linked"}</span>
        ${dossier?.horizon ? `<span class="tag">${escapeHtml(String(dossier.horizon))}</span>` : ""}
        <span class="tag">${citations.length} citations</span>
        ${dossier?.createdAt ? `<span class="tag">${formatGeneratedAt(dossier.createdAt)}</span>` : ""}
        ${dossier?.updatedAt ? `<span class="tag">Updated ${formatGeneratedAt(dossier.updatedAt)}</span>` : ""}
      </div>
      <div class="research-score-grid">
        <div class="math-metric">
          <span>Source quality</span>
          <strong>${formatDecisionMathValue(evidenceQuality, { probability: true })}</strong>
        </div>
        <div class="math-metric">
          <span>Timeliness</span>
          <strong>${formatDecisionMathValue(timeliness, { probability: true })}</strong>
        </div>
      </div>
      <div>
        <span class="eyebrow">Supporting evidence</span>
        ${renderResearchEvidenceList(getResearchEvidenceList(dossier, "supportingEvidence"), "No supporting evidence logged yet.")}
      </div>
      <div>
        <span class="eyebrow">Contradicting evidence</span>
        ${renderResearchEvidenceList(getResearchEvidenceList(dossier, "contradictingEvidence"), "No contradictory evidence logged yet.")}
      </div>
      ${
        riskFactors.length
          ? `
            <div class="chip-row">
              ${riskFactors.slice(0, 4).map((risk) => `<span class="tag tag-muted">${escapeHtml(formatEvidenceItem(risk))}</span>`).join("")}
            </div>
          `
          : ""
      }
      <div class="office-form-actions">
        <button class="mini-chip" type="button" data-edit-research="${escapeHtml(dossier.id)}">Edit</button>
        ${
          status !== "validated" && status !== "approved"
            ? `<button class="mini-chip" type="button" data-research-status="${escapeHtml(dossier.id)}" data-next-status="validated">Validate</button>`
            : ""
        }
        ${
          status !== "approved"
            ? `<button class="mini-chip" type="button" data-research-status="${escapeHtml(dossier.id)}" data-next-status="approved">Approve thesis</button>`
            : ""
        }
        ${
          status !== "dismissed"
            ? `<button class="mini-chip" type="button" data-research-status="${escapeHtml(dossier.id)}" data-next-status="dismissed">Dismiss</button>`
            : ""
        }
        <button class="mini-chip" type="button" data-delete-research="${escapeHtml(dossier.id)}">Delete</button>
      </div>
      ${
        assets.length
          ? `<div class="chip-row">${assets.map((asset) => `<button class="mini-chip" data-asset="${asset}">${asset}</button>`).join("")}</div>`
          : ""
      }
    </article>
  `;
}

function renderResearchLifecycleBoard(dossiers) {
  const groups = {
    discovery: [],
    candidate: [],
    validated: [],
    approved: [],
    dismissed: [],
    expired: [],
    archived: []
  };

  dossiers.forEach((dossier) => {
    const status = normalizeResearchStatus(dossier?.status || dossier?.stage);
    const bucket = groups[status] ? status : "candidate";
    groups[bucket].push(dossier);
  });

  const stages = [
    ["discovery", "Research inbox"],
    ["candidate", "Candidate thesis"],
    ["validated", "Validated"],
    ["approved", "Approved"],
    ["dismissed", "Dismissed"],
    ["expired", "Expired"],
    ["archived", "Archived"]
  ];

  return `
    <section class="lifecycle-board">
      ${stages
        .map(([status, label]) => {
          const items = groups[status] || [];
          return `
            <article class="lifecycle-column lifecycle-${status}">
              <div class="lifecycle-column-head">
                <span>${label}</span>
                <strong>${items.length}</strong>
              </div>
              <div class="lifecycle-column-body">
                ${
                  items.length
                    ? items
                        .slice(0, 3)
                        .map(
                          (dossier) => `
                            <div class="lifecycle-card">
                              <div class="decision-topline">
                                <strong>${escapeHtml(getResearchDossierHeadline(dossier))}</strong>
                                ${renderLifecyclePill(status)}
                              </div>
                              <p>${escapeHtml(dossier?.thesis || dossier?.summary || "No summary provided.")}</p>
                            </div>
                          `
                        )
                        .join("")
                    : `<p class="subtle">Nothing here yet.</p>`
                }
              </div>
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderDecisionReviewTag(status = "proposed") {
  const label = status === "proposed" ? "Candidate" : formatEnumLabel(status);
  return `<span class="tag review-tag review-${escapeHtml(status)}">${label}</span>`;
}

function renderDecisionReviewActions(reviewId, reviewStatus = "proposed", extraActions = "") {
  if (!reviewId) {
    return `<span class="subtle">No live decision to review.</span>`;
  }

  const disabledAttribute = state.isMutating ? "disabled" : "";

  return `
    <div class="office-review-actions">
      <button class="mini-chip" type="button" data-review-decision="${escapeHtml(reviewId)}" data-review-status="approved" ${disabledAttribute}>Approve</button>
      <button class="mini-chip" type="button" data-review-decision="${escapeHtml(reviewId)}" data-review-status="dismissed" ${disabledAttribute}>Dismiss</button>
      ${
        reviewStatus !== "proposed"
          ? `<button class="mini-chip" type="button" data-review-decision="${escapeHtml(reviewId)}" data-review-status="proposed" ${disabledAttribute}>Reset</button>`
          : ""
      }
      ${extraActions}
    </div>
  `;
}

function renderDecisionReviewGate(reviewId, reviewStatus, decision = null, research = null) {
  const researchAction = research
    ? `<button class="mini-chip" type="button" data-view="decisions">Open Decisions</button>`
    : "";

  if (!isResearchEligibleForReview(research)) {
    return `
      <div class="office-review-actions">
        <span class="subtle">${escapeHtml(getResearchBlockingReason(decision, research))}</span>
        ${researchAction}
      </div>
    `;
  }

  return renderDecisionReviewActions(reviewId, reviewStatus, researchAction);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSourceReliabilityInfo(source) {
  const score = Number(source?.reliability?.score ?? source?.baselineReliability ?? 0);
  const normalizedScore = Number.isFinite(score) ? Math.max(0, Math.min(score, 0.99)) : 0.5;
  const label =
    String(source?.reliability?.label || "").trim() ||
    (normalizedScore >= 0.72
      ? "Reliable"
      : normalizedScore >= 0.58
        ? "Review carefully"
        : "Fact-check needed");
  const tier =
    String(source?.reliability?.tier || "").trim() ||
    (normalizedScore >= 0.85 ? "high" : normalizedScore >= 0.72 ? "solid" : normalizedScore >= 0.58 ? "mixed" : "low");
  const operatorGuidance =
    String(source?.reliability?.operatorGuidance || "").trim() ||
    (label === "Reliable"
      ? "Good source, but still validate the claimed operating impact."
      : label === "Review carefully"
        ? "Useful signal input, but corroborate before it shapes a decision."
        : "Treat as radar only until the claim is independently verified.");

  return {
    score: Number(normalizedScore.toFixed(2)),
    label,
    tier,
    operatorGuidance
  };
}

function getAssetMappingInfo(post) {
  const mapping = post?.assetMapping || {};
  const mappedAssets = Array.isArray(post?.mappedAssets) ? post.mappedAssets : [];
  const labelByBasis = {
    unmapped: "Unmapped",
    direct: "Direct mapping",
    source_hint: "Source hint",
    mixed: "Mixed mapping",
    broad_inference: "Broad inference",
    model_inference: "Review mapping",
    cluster_inference: "Cluster inference"
  };
  const basis = String(mapping.basis || (mappedAssets.length ? "direct" : "unmapped")).trim();
  const confidence = String(mapping.confidence || (mappedAssets.length ? "high" : "low")).trim();
  const label = String(mapping.label || labelByBasis[basis] || "Review mapping").trim();
  const note = String(mapping.note || "").trim();
  const requiresReview =
    Boolean(mapping.requiresReview) ||
    basis === "mixed" ||
    basis === "broad_inference" ||
    basis === "model_inference" ||
    basis === "cluster_inference";

  return {
    basis,
    confidence,
    label,
    note,
    requiresReview
  };
}

function getPostVerificationInfo(post) {
  const verification = post?.verification || {};
  const status = String(verification.status || "").trim() || "trusted";
  const badge = String(verification.badge || "").trim();
  const note = String(verification.note || "").trim();

  return {
    status,
    badge,
    note,
    requirement: String(verification.requirement || "").trim(),
    blocksActionability: Boolean(verification.blocksActionability),
    overrideActive: Boolean(verification.overrideActive),
    corroborated: Boolean(verification.corroborated),
    corroboratingSourceCount: Number(verification.corroboratingSourceCount || 0)
  };
}

function renderPostVerificationTag(post, className = "") {
  const verification = getPostVerificationInfo(post);

  if (!verification.badge || verification.status === "trusted") {
    return "";
  }

  const resolvedClassName =
    className ||
    (verification.blocksActionability
      ? "tag tag-warning"
      : verification.overrideActive
        ? "tag"
        : "tag tag-muted");

  return `<span class="${resolvedClassName}">${escapeHtml(verification.badge)}</span>`;
}

function renderPostVerificationNote(post, className = "mapping-note") {
  const verification = getPostVerificationInfo(post);

  if (!verification.note || verification.status === "trusted") {
    return "";
  }

  return `<p class="${className}">${escapeHtml(verification.note)}</p>`;
}

function renderPostVerificationControls(post) {
  const verification = getPostVerificationInfo(post);
  const postId = String(post?.id || "").trim();

  if (!postId || postId.startsWith("adhoc-test-") || verification.requirement !== "corroboration_or_override") {
    return "";
  }

  return `
    <div class="verification-actions">
      <button
        class="mini-chip"
        type="button"
        data-post-verification-override="${escapeHtml(postId)}"
        data-post-verification-enabled="${verification.overrideActive ? "0" : "1"}"
      >
        ${verification.overrideActive ? "Clear override" : "Override fact-check gate"}
      </button>
    </div>
  `;
}

function renderPostVerificationStack(post) {
  const verificationTag = renderPostVerificationTag(post);
  const verificationNote = renderPostVerificationNote(post);
  const verificationControls = renderPostVerificationControls(post);

  if (!verificationTag && !verificationNote && !verificationControls) {
    return "";
  }

  return `
    <div class="verification-stack">
      ${verificationTag ? `<div class="chip-row verification-chip-row">${verificationTag}</div>` : ""}
      ${verificationNote}
      ${verificationControls}
    </div>
  `;
}

function renderMappedAssetButtons(post, buttonClass = "mini-chip", emptyLabel = "Unmapped") {
  const mappedAssets = Array.isArray(post?.mappedAssets) ? post.mappedAssets : [];

  if (!mappedAssets.length) {
    return `<span class="subtle">${escapeHtml(emptyLabel)}</span>`;
  }

  return mappedAssets
    .map((asset) => {
      const safeAsset = escapeHtml(String(asset));
      return `<button class="${buttonClass}" data-asset="${safeAsset}">${safeAsset}</button>`;
    })
    .join("");
}

function renderAssetMappingStatusTag(post, className = "tag tag-warning") {
  const mapping = getAssetMappingInfo(post);

  if (!mapping.requiresReview) {
    return "";
  }

  return `<span class="${className}">${escapeHtml(mapping.label)}</span>`;
}

function renderAssetMappingNote(post, className = "mapping-note") {
  const mapping = getAssetMappingInfo(post);

  if (!mapping.requiresReview) {
    return "";
  }

  return `<p class="${className}">${escapeHtml(mapping.note || "Ticker linkage is inferred; review the mapping before acting.")}</p>`;
}

function renderMappedAssetStack(post, buttonClass = "mini-chip") {
  return `
    <div class="mapping-stack">
      <div class="chip-row mapping-chip-row">
        ${renderMappedAssetButtons(post, buttonClass)}
        ${renderAssetMappingStatusTag(post)}
      </div>
      ${renderAssetMappingNote(post)}
    </div>
  `;
}

function renderAssetMappingCell(post) {
  const mappedAssets = Array.isArray(post?.mappedAssets) ? post.mappedAssets : [];
  const mapping = getAssetMappingInfo(post);

  return `
    <div class="mapping-cell">
      <span>${escapeHtml(mappedAssets.join(", ") || "Unmapped")}</span>
      ${mapping.requiresReview ? `<span class="tag tag-warning mapping-inline-tag">${escapeHtml(mapping.label)}</span>` : ""}
      ${
        mapping.requiresReview
          ? `<small class="mapping-note mapping-note-compact">${escapeHtml(mapping.note || "Ticker linkage is inferred; review the mapping before acting.")}</small>`
          : ""
      }
      ${renderLikelyImpactInline(post)}
    </div>
  `;
}

function getLikelyImpacts(
  post,
  profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile
) {
  const likelyImpacts = Array.isArray(post?.likelyImpacts) ? post.likelyImpacts : [];
  const normalizedBaseImpacts = likelyImpacts.length
    ? likelyImpacts
        .map((impact) => ({
          asset: normalizeTicker(impact.asset),
          score: Number(impact.score || 0),
          directness: String(impact.directness || "Read-through").trim() || "Read-through",
          impactDirection: String(impact.impactDirection || "Mixed").trim() || "Mixed",
          reason: String(impact.reason || "").trim()
        }))
        .filter((impact) => impact.asset)
    : (Array.isArray(post?.mappedAssets) ? post.mappedAssets : []).map((asset, index) => ({
        asset: normalizeTicker(asset),
        score: Math.max(0.42, 0.74 - index * 0.08),
        directness: index === 0 ? "Direct" : "Read-through",
        impactDirection: "Mixed",
        reason: "Derived from the post's strict asset mapping."
      }));
  const trackedTickers = getTrackedAssetTickers(profile);
  const trackedIndex = new Map(trackedTickers.map((ticker, index) => [ticker, index]));
  const impactMap = new Map();

  normalizedBaseImpacts.forEach((impact) => {
    const ticker = normalizeTicker(impact.asset);

    if (!ticker) {
      return;
    }

    const normalizedImpact = {
      asset: ticker,
      score: Number(Math.max(0, Math.min(Number(impact.score || 0), 1)).toFixed(2)),
      directness: String(impact.directness || "Read-through").trim() || "Read-through",
      impactDirection: String(impact.impactDirection || "Mixed").trim() || "Mixed",
      reason: String(impact.reason || "").trim()
    };
    const existing = impactMap.get(ticker);

    if (!existing || normalizedImpact.score > existing.score) {
      impactMap.set(ticker, normalizedImpact);
    }
  });

  return [...impactMap.values()]
    .sort(
      (left, right) =>
        (trackedIndex.has(left.asset) ? 0 : 1) - (trackedIndex.has(right.asset) ? 0 : 1) ||
        right.score - left.score ||
        (trackedIndex.get(left.asset) ?? 999) - (trackedIndex.get(right.asset) ?? 999) ||
        left.asset.localeCompare(right.asset)
    )
    .slice(0, 8);
}

function renderLikelyImpactChip(impact) {
  const safeAsset = escapeHtml(impact.asset);
  const safeDirectness = escapeHtml(impact.directness || "Read-through");
  const safeImpactDirection = escapeHtml(impact.impactDirection || "Mixed");
  const safeReason = escapeHtml(impact.reason || "");

  return `
    <button class="impact-chip" data-asset="${safeAsset}" title="${safeReason}">
      <strong>${safeAsset}</strong>
      <span>${safeImpactDirection} · ${safeDirectness} · ${formatPercent(Math.max(0, Math.min(Number(impact.score || 0), 1)))}</span>
    </button>
  `;
}

function renderLikelyImpactSummary(post) {
  const impacts = getLikelyImpacts(post);
  const trackedTickers = getTrackedAssetTickers();
  const trackedSet = new Set(trackedTickers);
  const trackedImpacts = impacts.filter((impact) => trackedSet.has(impact.asset)).slice(0, 3);
  const widerImpacts = (trackedTickers.length ? impacts.filter((impact) => !trackedSet.has(impact.asset)) : impacts).slice(0, 4);

  if (!impacts.length) {
    return `<div class="impact-stack"><p class="impact-empty">No likely impacts ranked for this post yet.</p></div>`;
  }

  return `
    <div class="impact-stack">
      ${
        trackedTickers.length
          ? `
            <div class="impact-group">
              <span class="impact-label">AI-ranked in your tracked universe</span>
              <div class="chip-row impact-chip-row">
                ${
                  trackedImpacts.length
                    ? trackedImpacts.map((impact) => renderLikelyImpactChip(impact)).join("")
                    : '<span class="impact-empty">No current tracked names rank for this post yet.</span>'
                }
              </div>
            </div>
          `
          : ""
      }
      <div class="impact-group">
        <span class="impact-label">${trackedTickers.length ? "Wider AI-ranked impacts" : "AI-ranked impacted stocks"}</span>
        <div class="chip-row impact-chip-row">
          ${
            widerImpacts.length
              ? widerImpacts.map((impact) => renderLikelyImpactChip(impact)).join("")
              : '<span class="impact-empty">No broader impacts ranked for this post.</span>'
          }
        </div>
      </div>
    </div>
  `;
}

function renderLikelyImpactInline(post) {
  const impacts = getLikelyImpacts(post);
  const trackedTickers = getTrackedAssetTickers();
  const trackedSet = new Set(trackedTickers);
  const primaryImpacts = trackedTickers.length
    ? impacts.filter((impact) => trackedSet.has(impact.asset)).slice(0, 3)
    : impacts.slice(0, 3);
  const fallbackImpacts = impacts.slice(0, 3);
  const visibleImpacts = primaryImpacts.length ? primaryImpacts : fallbackImpacts;
  const label = primaryImpacts.length && trackedTickers.length ? "Tracked impacts" : "Likely impacts";

  if (!visibleImpacts.length) {
    return "";
  }

  return `
    <div class="impact-inline">
      <strong class="impact-inline-label">${label}</strong>
      <span>${escapeHtml(visibleImpacts.map((impact) => `${impact.asset} (${impact.impactDirection}, ${impact.directness})`).join(", "))}</span>
    </div>
  `;
}

function renderJsonBlock(value) {
  return `<pre class="code-block">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function getSourceBeingEdited() {
  return getData().sources.find((source) => source.id === state.editingSourceId) || null;
}

function getResearchBeingEdited() {
  return getResearchDossierById(state.editingResearchId);
}

function getLatestAdvisorAnswer() {
  return state.advisorAnswer || getAdvisor().history[0] || null;
}

function formatCurrency(value) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue)
    ? numericValue.toLocaleString(undefined, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0
      })
    : "€0";
}

function buildProfileDocumentDraft(profile = EMPTY_DATA.advisor.financialProfile) {
  return (profile.documents || []).map((document, index) => ({
    id: document.id || `document-${index + 1}`,
    name: document.name || `Document ${index + 1}`,
    category: document.category || "General",
    sizeBytes: Number(document.sizeBytes || 0),
    lastModified: document.lastModified || "",
    notes: document.notes || ""
  }));
}

function syncProfileDocumentDraft(profile = EMPTY_DATA.advisor.financialProfile) {
  state.profileDocumentDraft = buildProfileDocumentDraft(profile);
}

function syncProfileDraft(profile = EMPTY_DATA.advisor.financialProfile) {
  state.profileDraft = JSON.parse(JSON.stringify(profile));
  syncProfileDocumentDraft(profile);
}

function getProfileDraft() {
  if (!state.profileDraft) {
    syncProfileDraft(getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile);
  }

  return state.profileDraft;
}

function getProfileDocumentDraft() {
  if (!Array.isArray(state.profileDocumentDraft) || !state.profileDraft) {
    syncProfileDocumentDraft(getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile);
  }

  return state.profileDocumentDraft;
}

function getDefaultProfileCollectionItem(collection) {
  if (collection === "holdings") {
    return {
      ticker: "",
      category: "Stock",
      currentValue: "",
      costBasis: "",
      accountType: "Brokerage",
      notes: "",
      label: ""
    };
  }

  if (collection === "retirementProducts") {
    return {
      label: "",
      type: "Private Rentenversicherung",
      provider: "",
      currentValue: "",
      monthlyContribution: "",
      notes: ""
    };
  }

  if (collection === "liabilities") {
    return {
      label: "",
      category: "Mortgage",
      balance: "",
      interestRate: "",
      monthlyPayment: "",
      notes: ""
    };
  }

  return {};
}

function addProfileCollectionItem(collection) {
  const profileDraft = getProfileDraft();
  const currentItems = Array.isArray(profileDraft[collection]) ? profileDraft[collection] : [];
  profileDraft[collection] = [...currentItems, getDefaultProfileCollectionItem(collection)];
  render();
}

function removeProfileCollectionItem(collection, index) {
  const profileDraft = getProfileDraft();
  profileDraft[collection] = (profileDraft[collection] || []).filter((_, itemIndex) => itemIndex !== Number(index));
  render();
}

function updateProfileCollectionItem(collection, index, field, value) {
  const profileDraft = getProfileDraft();
  const currentItems = Array.isArray(profileDraft[collection]) ? [...profileDraft[collection]] : [];
  const itemIndex = Number(index);
  const nextItem = {
    ...getDefaultProfileCollectionItem(collection),
    ...(currentItems[itemIndex] || {})
  };
  const numericFields = new Set([
    "currentValue",
    "costBasis",
    "balance",
    "interestRate",
    "monthlyPayment",
    "monthlyContribution"
  ]);

  nextItem[field] =
    collection === "holdings" && field === "ticker"
      ? normalizeTicker(value)
      : numericFields.has(field)
        ? Number(value || 0)
        : value;

  if (collection === "holdings" && field === "ticker" && !nextItem.label) {
    nextItem.label = nextItem.ticker || "Holding";
  }

  currentItems[itemIndex] = nextItem;
  profileDraft[collection] = currentItems;
}

function syncProfileCollectionFields(form) {
  if (!form?.querySelectorAll) {
    return;
  }

  form.querySelectorAll("[data-profile-item-field]").forEach((input) => {
    updateProfileCollectionItem(
      input.dataset.collection,
      input.dataset.index,
      input.dataset.field,
      input.value
    );
  });
}

function getProfileCollectionCardTitle(collection, item, index, title) {
  if (collection === "holdings") {
    return item.ticker || item.notes || `Holding ${index + 1}`;
  }

  if (collection === "retirementProducts") {
    return item.label || item.provider || item.type || `${title} ${index + 1}`;
  }

  if (collection === "liabilities") {
    return item.label || item.category || `${title} ${index + 1}`;
  }

  return item.label || item.ticker || item.provider || item.category || `${title} ${index + 1}`;
}

function renderProfileCollectionField(collection, index, item, field) {
  const baseAttributes = `data-profile-item-field data-collection="${collection}" data-index="${index}" data-field="${field.key}"`;
  const value = item[field.key] ?? "";

  if (field.type === "select") {
    return `
      <label class="form-field">
        <span>${field.label}</span>
        <select ${baseAttributes}>
          ${field.options
            .map(
              (option) => `
                <option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>
              `
            )
            .join("")}
        </select>
      </label>
    `;
  }

  if (field.type === "textarea") {
    return `
      <label class="form-field collection-field-full">
        <span>${field.label}</span>
        <textarea rows="${field.rows || 3}" ${baseAttributes} placeholder="${escapeHtml(field.placeholder || "")}">${escapeHtml(value)}</textarea>
      </label>
    `;
  }

  return `
    <label class="form-field">
      <span>${field.label}</span>
      <input
        type="${field.type === "number" ? "number" : "text"}"
        ${field.type === "number" ? 'step="0.01"' : ""}
        ${baseAttributes}
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(field.placeholder || "")}"
      />
    </label>
  `;
}

function renderProfileCollectionSection({ collection, title, copy, addLabel, emptyCopy, fields }) {
  const items = getProfileDraft()[collection] || [];

  return `
    <section class="profile-collection-section">
      <div class="office-panel-head">
        <div>
          <h3>${title}</h3>
          <p class="section-copy">${copy}</p>
        </div>
        <button class="mini-chip" type="button" data-add-profile-item="${collection}">${addLabel}</button>
      </div>
      ${
        items.length
          ? `
            <div class="profile-collection-list">
              ${items
                .map(
                  (item, index) => `
                    <article class="profile-collection-card">
                      <div class="profile-collection-card-head">
                        <strong>${escapeHtml(getProfileCollectionCardTitle(collection, item, index, title))}</strong>
                        <button class="mini-chip" type="button" data-remove-profile-item="${collection}:${index}">Remove</button>
                      </div>
                      <div class="profile-collection-grid">
                        ${fields.map((field) => renderProfileCollectionField(collection, index, item, field)).join("")}
                      </div>
                    </article>
                  `
                )
                .join("")}
            </div>
          `
          : `<article class="status-inline"><strong>No entries yet</strong><p>${emptyCopy}</p></article>`
      }
    </section>
  `;
}

function setProfileOnboardingStep(nextStep) {
  state.profileOnboardingStep = Math.max(0, Math.min(2, Number(nextStep) || 0));
}

function hydrateProfileDraftFromForm(form) {
  if (!form) {
    return getProfileDraft();
  }

  syncProfileCollectionFields(form);

  const profileDraft = {
    ...getProfileDraft()
  };
  const formData = new FormData(form);

  if (formData.has("investorName")) {
    profileDraft.investorName = String(formData.get("investorName") || "").trim();
  }
  if (formData.has("riskTolerance")) {
    profileDraft.riskTolerance = String(formData.get("riskTolerance") || "Moderate").trim();
  }
  if (formData.has("investmentHorizon")) {
    profileDraft.investmentHorizon = String(formData.get("investmentHorizon") || "").trim();
  }
  if (formData.has("liquidityNeeds")) {
    profileDraft.liquidityNeeds = String(formData.get("liquidityNeeds") || "").trim();
  }
  if (formData.has("watchlist")) {
    profileDraft.watchlist = String(formData.get("watchlist") || "")
      .split(",")
      .map((item) => normalizeTicker(item))
      .filter(Boolean);
  }
  if (formData.has("monthlyNetIncome")) {
    profileDraft.monthlyNetIncome = Number(formData.get("monthlyNetIncome") || 0);
  }
  if (formData.has("monthlyExpenses")) {
    profileDraft.monthlyExpenses = Number(formData.get("monthlyExpenses") || 0);
  }
  if (formData.has("emergencyFund")) {
    profileDraft.emergencyFund = Number(formData.get("emergencyFund") || 0);
  }
  if (formData.has("targetEmergencyFundMonths")) {
    profileDraft.targetEmergencyFundMonths = Number(formData.get("targetEmergencyFundMonths") || 6);
  }
  if (formData.has("goals")) {
    profileDraft.goals = String(formData.get("goals") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (formData.has("notes")) {
    profileDraft.notes = String(formData.get("notes") || "").trim();
  }
  if (formData.has("holdings")) {
    profileDraft.holdings = parseDelimitedRows(formData.get("holdings"), (parts) => ({
      ticker: parts[0] || "",
      category: parts[1] || "Other",
      currentValue: Number(parts[2] || 0),
      costBasis: Number(parts[3] || 0),
      accountType: parts[4] || "Brokerage",
      notes: parts[5] || "",
      label: parts[0] || "Holding"
    }));
  }
  if (formData.has("retirementProducts")) {
    profileDraft.retirementProducts = parseDelimitedRows(formData.get("retirementProducts"), (parts) => ({
      label: parts[0] || "Retirement product",
      type: parts[1] || "Pension / Insurance",
      provider: parts[2] || "",
      currentValue: Number(parts[3] || 0),
      monthlyContribution: Number(parts[4] || 0),
      notes: parts[5] || ""
    }));
  }
  if (formData.has("liabilities")) {
    profileDraft.liabilities = parseDelimitedRows(formData.get("liabilities"), (parts) => ({
      label: parts[0] || "Liability",
      category: parts[1] || "Loan",
      balance: Number(parts[2] || 0),
      interestRate: Number(parts[3] || 0),
      monthlyPayment: Number(parts[4] || 0),
      notes: parts[5] || ""
    }));
  }

  profileDraft.documents = getProfileDocumentDraft();
  state.profileDraft = profileDraft;
  return profileDraft;
}

function parseDelimitedRows(rawValue, mapping) {
  return String(rawValue || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((item) => item.trim());
      return mapping(parts);
    });
}

function formatGeneratedAt(value) {
  if (!value) {
    return "Waiting for snapshot";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  })} ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function hasRenderableData() {
  const { monitoredUniverse, sources } = getData();
  return monitoredUniverse.length > 0 && sources.length > 0;
}

function getDecisionByAsset(ticker) {
  return getData().decisions.find((decision) => decision.asset === ticker);
}

function getCluster(clusterId) {
  return getData().clusters.find((cluster) => cluster.id === clusterId);
}

function getSource(sourceId) {
  return getData().sources.find((source) => source.id === sourceId);
}

function getPostsForSource(sourceId) {
  return sortPostsByCreatedAt(getData().posts.filter((post) => post.sourceId === sourceId));
}

function getPostsForCluster(clusterId) {
  return sortPostsByCreatedAt(getData().posts.filter((post) => post.clusterId === clusterId));
}

function getFilteredDecisions() {
  const { decisions } = getData();

  if (state.actionFilter === "ALL") {
    return decisions;
  }

  return decisions.filter((decision) => decision.action === state.actionFilter);
}

function getRecentAnalysedPosts() {
  if (state.recentTweets.length) {
    return state.recentTweets;
  }

  const { metadata, posts } = getData();
  const snapshotTime = metadata.generatedAt ? new Date(metadata.generatedAt).getTime() : Date.now();
  const cutoffTime = snapshotTime - 3 * 24 * 60 * 60 * 1000;

  return sortPostsByCreatedAt(posts)
    .filter((post) => {
      const postTime = post.createdAt ? new Date(post.createdAt).getTime() : Number.NaN;
      return Number.isFinite(postTime) && postTime >= cutoffTime && postTime <= snapshotTime;
    });
}

function countBy(items, getKey) {
  return items.reduce((accumulator, item) => {
    const key = getKey(item);
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function average(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildDecisionHistoryAnalytics(entries) {
  const directionalReturns = entries
    .map((entry) => entry.directionalReturn)
    .filter((value) => typeof value === "number");
  const assetRows = Object.entries(countBy(entries, (entry) => entry.asset))
    .map(([asset, count]) => {
      const assetEntries = entries.filter((entry) => entry.asset === asset);
      const assetDirectionalReturns = assetEntries
        .map((entry) => entry.directionalReturn)
        .filter((value) => typeof value === "number");
      const winRateBase = assetEntries.filter(
        (entry) => entry.outcomeState === "favorable" || entry.outcomeState === "stable"
      ).length;

      return {
        asset,
        count,
        averageDirectionalReturn: average(assetDirectionalReturns),
        averageConfidence: average(assetEntries.map((entry) => entry.confidence).filter(Boolean)),
        winRate: count ? winRateBase / count : null
      };
    })
    .sort((left, right) => (right.averageDirectionalReturn ?? -Infinity) - (left.averageDirectionalReturn ?? -Infinity));

  return {
    actionBreakdown: countBy(entries, (entry) => entry.action),
    outcomeBreakdown: countBy(entries, (entry) => entry.outcomeState || "open"),
    averageDirectionalReturn: average(directionalReturns),
    averageConfidence: average(entries.map((entry) => entry.confidence).filter(Boolean)),
    assetRows,
    bestAsset: assetRows[0] || null,
    weakestAsset: [...assetRows]
      .sort((left, right) => (left.averageDirectionalReturn ?? Infinity) - (right.averageDirectionalReturn ?? Infinity))[0] || null
  };
}

function buildRunDecisionAnalytics(entries) {
  return {
    count: entries.length,
    favorableCount: entries.filter((entry) => entry.outcomeState === "favorable").length,
    againstCount: entries.filter((entry) => entry.outcomeState === "against").length,
    openCount: entries.filter((entry) => entry.outcomeState === "open").length,
    averageDirectionalReturn: average(
      entries.map((entry) => entry.directionalReturn).filter((value) => typeof value === "number")
    ),
    averageConfidence: average(entries.map((entry) => entry.confidence).filter(Boolean))
  };
}

function normalizeSelections() {
  const profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile;
  const watchedUniverse = getWatchedUniverse(profile);
  const { sources } = getData();

  if (!watchedUniverse.some((asset) => asset.ticker === state.selectedAsset)) {
    state.selectedAsset = watchedUniverse[0]?.ticker || "";
  }

  if (!sources.some((source) => source.id === state.selectedSource)) {
    state.selectedSource = sources[0]?.id || "";
  }
}

function normalizeReplaySelection() {
  const replayCandidates = state.recentTweets.length ? state.recentTweets : getData().posts;

  if (!replayCandidates.some((post) => post.id === state.selectedReplayPostId)) {
    state.selectedReplayPostId = replayCandidates[0]?.id || "";
    state.replayData = null;
  }
}

function normalizeHistorySelections() {
  const history = getHistory();
  const evaluation = getEvaluation();
  const latestRunId = history.latestRunId || history.runs[0]?.id || "";
  const latestEvalId = evaluation.latestRun?.id || evaluation.history[0]?.id || "";

  if (!history.runs.some((run) => run.id === state.selectedRunId)) {
    state.selectedRunId = latestRunId;
    state.selectedRunDetail = null;
  }

  if (!evaluation.history.some((run) => run.id === state.selectedEvalId)) {
    state.selectedEvalId = latestEvalId;
    state.selectedEvalDetail = null;
  }
}

async function loadData({ refresh = false } = {}) {
  if (refresh) {
    state.isRefreshing = true;
  } else {
    state.isLoading = true;
  }

  state.error = "";
  render();

  try {
    const [snapshotResponse, tweetsResponse, statusResponse] = await Promise.all([
      fetch("/api/app-data", { cache: "no-store" }),
      fetch("/api/analysed-posts?days=3&limit=100", { cache: "no-store" }),
      fetch("/api/tweet-store/status", { cache: "no-store" })
    ]);

    if (!snapshotResponse.ok) {
      throw new Error(await parseError(snapshotResponse, `Snapshot request failed with ${snapshotResponse.status}`));
    }

    if (!tweetsResponse.ok) {
      throw new Error(await parseError(tweetsResponse, `Tweet feed request failed with ${tweetsResponse.status}`));
    }

    if (!statusResponse.ok) {
      throw new Error(await parseError(statusResponse, `Store status request failed with ${statusResponse.status}`));
    }

    state.data = await snapshotResponse.json();
    state.recentTweets = (await tweetsResponse.json()).posts || [];
    state.storeStatus = await statusResponse.json();
    syncProfileDraft(getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile);
    normalizeSelections();
    normalizeReplaySelection();
    normalizeHistorySelections();

    if (!state.developerMode && isDeveloperView(state.view)) {
      state.view = "dashboard";
    }

    if (state.editingSourceId && !getSourceBeingEdited()) {
      state.editingSourceId = "";
    }

    if (state.editingResearchId && !getResearchBeingEdited()) {
      state.editingResearchId = "";
    }

    const deferredLoads = [];

    if (state.view === "admin" && state.selectedReplayPostId) {
      deferredLoads.push(
        loadReplay({
          postId: state.selectedReplayPostId,
          silent: true
        })
      );
    }

    if (state.view === "logs" && state.selectedRunId) {
      deferredLoads.push(
        loadPipelineRunDetail({
          runId: state.selectedRunId,
          silent: true
        })
      );
    }

    if (state.view === "logs" && state.selectedEvalId) {
      deferredLoads.push(
        loadEvalRunDetail({
          evalId: state.selectedEvalId,
          silent: true
        })
      );
    }

    if (deferredLoads.length) {
      await Promise.all(deferredLoads);
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Failed to load app data.";
  } finally {
    state.isLoading = false;
    state.isRefreshing = false;
    render();
  }
}

async function parseError(response, fallbackMessage) {
  try {
    const payload = await response.json();
    return payload?.error || fallbackMessage;
  } catch (_error) {
    return fallbackMessage;
  }
}

function setEditingSource(sourceId = "") {
  state.editingSourceId = sourceId;
  state.operatorNotice = "";
  render();
}

function setEditingResearch(dossierId = "") {
  state.editingResearchId = dossierId;
  state.operatorNotice = "";
  render();
}

async function runMutation(task, successMessage) {
  state.isMutating = true;
  state.error = "";
  state.operatorNotice = "";
  render();

  try {
    const result = await task();
    state.operatorNotice =
      typeof successMessage === "function" ? successMessage(result) : successMessage;
    await loadData({ refresh: true });
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Operator action failed.";
  } finally {
    state.isMutating = false;
    render();
  }
}

async function reseedFakeTweets() {
  state.isReseeding = true;
  state.error = "";
  state.operatorNotice = "";
  render();

  try {
    const response = await fetch("/api/admin/reseed-fake-tweets", {
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Reseed request failed with ${response.status}`));
    }

    state.operatorNotice = "Fake tweets reseeded.";
    await loadData({ refresh: true });
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Failed to reseed fake tweets.";
  } finally {
    state.isReseeding = false;
    render();
  }
}

async function runPipelineFromOperator() {
  state.isRunningPipeline = true;
  state.error = "";
  state.operatorNotice = "";
  render();

  try {
    const response = await fetch("/api/admin/run-pipeline", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Manual operator refresh"
      })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Pipeline run failed with ${response.status}`));
    }

    const result = await response.json();
    state.selectedRunId = result.runId || "";
    state.selectedRunDetail = null;
    state.operatorNotice = `Pipeline run ${formatShortId(result.runId)} completed.`;
    await loadData({ refresh: true });
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Failed to run the pipeline.";
  } finally {
    state.isRunningPipeline = false;
    render();
  }
}

async function runEvalsFromOperator() {
  state.isRunningEvals = true;
  state.error = "";
  state.operatorNotice = "";
  render();

  try {
    const response = await fetch("/api/admin/run-evals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mode: getEngine().extractor?.activeMode === "openai" ? "openai" : "heuristic"
      })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Eval run failed with ${response.status}`));
    }

    const result = await response.json();
    state.selectedEvalId = result.runId || "";
    state.selectedEvalDetail = null;
    state.operatorNotice = `Eval run ${formatShortId(result.runId)} completed.`;
    await loadData({ refresh: true });
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Failed to run the eval harness.";
  } finally {
    state.isRunningEvals = false;
    render();
  }
}

async function sendDigestFromOperator() {
  state.isSendingDigest = true;
  state.error = "";
  state.operatorNotice = "";
  render();

  try {
    const response = await fetch("/api/admin/runtime/send-digest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Manual operator digest"
      })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Digest send failed with ${response.status}`));
    }

    const result = await response.json();
    state.operatorNotice = `Digest job ${formatShortId(result.jobId)} recorded.`;
    await loadData({ refresh: true });
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Failed to send the digest.";
  } finally {
    state.isSendingDigest = false;
    render();
  }
}

async function sendTestNotificationFromOperator() {
  state.isTestingNotification = true;
  state.error = "";
  state.operatorNotice = "";
  render();

  try {
    const response = await fetch("/api/admin/runtime/test-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary: "Single-user setup test notification from the operator console."
      })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Notification test failed with ${response.status}`));
    }

    state.operatorNotice = "Notification test recorded.";
    await loadData({ refresh: true });
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Failed to send the notification test.";
  } finally {
    state.isTestingNotification = false;
    render();
  }
}

async function importManualFeed(form) {
  const formData = new FormData(form);
  const payload = {
    sourceId: String(formData.get("manualSourceId") || "").trim(),
    sourceHandle: String(formData.get("manualSourceHandle") || "").trim(),
    sourceName: String(formData.get("manualSourceName") || "").trim(),
    sourceCategory: String(formData.get("manualSourceCategory") || "").trim(),
    allowedAssets: String(formData.get("manualAllowedAssets") || "").trim(),
    relevantSectors: String(formData.get("manualRelevantSectors") || "").trim(),
    rawText: String(formData.get("manualRawText") || ""),
    replaceExisting: formData.get("manualReplaceExisting") === "on"
  };

  await runMutation(async () => {
    const response = await fetch("/api/operator/manual-feed/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(await parseError(response, "Failed to import the manual feed."));
    }

    const result = await response.json();
    state.selectedSource = result.source?.id || state.selectedSource;
  }, payload.replaceExisting ? "Manual feed imported and replaced the current store." : "Manual feed appended.");
}

async function togglePostVerificationOverride(postId, enabled) {
  await runMutation(async () => {
    const response = await fetch(
      `/api/operator/post-verification-overrides/${encodeURIComponent(postId)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          enabled
        })
      }
    );

    if (!response.ok) {
      throw new Error(await parseError(response, "Failed to update the fact-check override."));
    }
  }, enabled ? "Fact-check override saved and the pipeline was rerun." : "Fact-check override cleared and the pipeline was rerun.");
}

async function saveFinancialProfile(form) {
  state.isSavingProfile = true;
  state.advisorError = "";
  state.advisorNotice = "";
  render();

  const payload = hydrateProfileDraftFromForm(form);

  try {
    const response = await fetch("/api/operator/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Profile save failed with ${response.status}`));
    }

    state.advisorNotice = "Financial profile saved.";
    await loadData({ refresh: true });
  } catch (error) {
    state.advisorError = error instanceof Error ? error.message : "Failed to save financial profile.";
  } finally {
    state.isSavingProfile = false;
    render();
  }
}

async function askAdvisor(form) {
  state.isAskingAdvisor = true;
  state.advisorError = "";
  state.advisorNotice = "";
  render();

  const formData = new FormData(form);

  try {
    const response = await fetch("/api/advisor/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        assetTicker: String(formData.get("assetTicker") || "").trim(),
        question: String(formData.get("question") || "").trim()
      })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Advisor request failed with ${response.status}`));
    }

    const payload = await response.json();
    state.advisorAnswer = payload.answer || null;
    state.advisorNotice = `Advice generated for ${payload.answer?.assetTicker || "the selected asset"}.`;
    await loadData({ refresh: true });
  } catch (error) {
    state.advisorError = error instanceof Error ? error.message : "Failed to get advisor answer.";
  } finally {
    state.isAskingAdvisor = false;
    render();
  }
}

async function submitSourceForm(form) {
  const formData = new FormData(form);
  const payload = {
    handle: String(formData.get("handle") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    category: String(formData.get("category") || "").trim(),
    baselineReliability: Number(formData.get("baselineReliability") || 0),
    preferredHorizon: String(formData.get("preferredHorizon") || "").trim(),
    policyTemplate: String(formData.get("policyTemplate") || "").trim(),
    relevantSectors: String(formData.get("relevantSectors") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    allowedAssets: String(formData.get("allowedAssets") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    specialHandling: String(formData.get("specialHandling") || "").trim(),
    tone: String(formData.get("tone") || "").trim()
  };
  const editingSource = getSourceBeingEdited();

  await runMutation(async () => {
    const response = await fetch(
      editingSource ? `/api/operator/sources/${editingSource.id}` : "/api/operator/sources",
      {
        method: editingSource ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      throw new Error(
        await parseError(
          response,
          editingSource ? "Failed to update source." : "Failed to create source."
        )
      );
    }

    const result = await response.json();
    state.editingSourceId = result.source?.id || "";
    return result;
  }, (result) => {
    const baseMessage = editingSource ? "Source updated." : "Source created.";
    return result?.pipelineWarning
      ? `${baseMessage} Live pipeline refresh is still degraded: ${result.pipelineWarning}`
      : baseMessage;
  });
}

async function deleteOperatorSource(sourceId) {
  await runMutation(async () => {
    const response = await fetch(`/api/operator/sources/${sourceId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      throw new Error(await parseError(response, "Failed to delete source."));
    }

    if (state.editingSourceId === sourceId) {
      state.editingSourceId = "";
    }

    return response.json();
  }, (result) =>
    result?.pipelineWarning
      ? `Source deleted. Live pipeline refresh is still degraded: ${result.pipelineWarning}`
      : "Source deleted.");
}

async function submitResearchForm(form) {
  const formData = new FormData(form);
  const editingResearch = getResearchBeingEdited();
  const payload = {
    title: String(formData.get("title") || "").trim(),
    theme: String(formData.get("theme") || "").trim(),
    assets: String(formData.get("assets") || "").trim(),
    horizon: String(formData.get("horizon") || "").trim(),
    thesis: String(formData.get("thesis") || "").trim(),
    supportingEvidence: String(formData.get("supportingEvidence") || "").trim(),
    contradictingEvidence: String(formData.get("contradictingEvidence") || "").trim(),
    citations: String(formData.get("citations") || "").trim(),
    edgeHypothesis: String(formData.get("edgeHypothesis") || "").trim(),
    riskFactors: String(formData.get("riskFactors") || "").trim(),
    sourceQualityScore: String(formData.get("sourceQualityScore") || "").trim(),
    timelinessScore: String(formData.get("timelinessScore") || "").trim(),
    status: String(formData.get("status") || "").trim() || "discovery"
  };

  await runMutation(async () => {
    const response = await fetch(
      editingResearch
        ? `/api/operator/research/${encodeURIComponent(editingResearch.id)}`
        : "/api/operator/research",
      {
        method: editingResearch ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      throw new Error(
        await parseError(
          response,
          editingResearch ? "Failed to update the research dossier." : "Failed to create the research dossier."
        )
      );
    }

    const result = await response.json();
    state.editingResearchId = result.dossier?.id || "";
  }, editingResearch ? "Research dossier updated." : "Research dossier captured.");
}

async function updateResearchStatus(dossierId, status) {
  const actionLabel = status === "approved" ? "approved" : status === "validated" ? "validated" : status === "dismissed" ? "dismissed" : "updated";

  await runMutation(async () => {
    const response = await fetch(`/api/operator/research/${encodeURIComponent(dossierId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status
      })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, "Failed to update the research dossier status."));
    }
  }, `Research dossier ${actionLabel}.`);
}

async function deleteOperatorResearch(dossierId) {
  await runMutation(async () => {
    const response = await fetch(`/api/operator/research/${encodeURIComponent(dossierId)}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      throw new Error(await parseError(response, "Failed to delete the research dossier."));
    }

    if (state.editingResearchId === dossierId) {
      state.editingResearchId = "";
    }
  }, "Research dossier deleted.");
}

async function updateDecisionReview(decisionId, status) {
  const actionLabel =
    status === "approved" ? "approved" : status === "dismissed" ? "dismissed" : "reset to proposed";

  await runMutation(async () => {
    const response = await fetch(`/api/operator/decision-reviews/${encodeURIComponent(decisionId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status
      })
    });

    if (!response.ok) {
      throw new Error(await parseError(response, "Failed to update the decision review."));
    }
  }, `Decision ${actionLabel}.`);
}

async function loadReplay({ postId = state.selectedReplayPostId, live = false, silent = false } = {}) {
  if (!postId) {
    return;
  }

  if (state.selectedReplayPostId !== postId) {
    state.replayData = null;
  }

  state.selectedReplayPostId = postId;
  state.replayError = "";
  state.isReplayLoading = true;

  if (!silent) {
    render();
  }

  try {
    const searchParams = new URLSearchParams({
      postId
    });

    if (live) {
      searchParams.set("live", "1");
    }

    const response = await fetch(`/api/engine/extraction-replay?${searchParams.toString()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Replay request failed with ${response.status}`));
    }

    state.replayData = await response.json();
  } catch (error) {
    state.replayError = error instanceof Error ? error.message : "Failed to load extraction replay.";
  } finally {
    state.isReplayLoading = false;
    render();
  }
}

function buildTestDrivePayload(form) {
  const formData = new FormData(form);

  return {
    sourceId: String(formData.get("testSourceId") || "").trim(),
    sourceHandle: String(formData.get("testSourceHandle") || "").trim(),
    sourceName: String(formData.get("testSourceName") || "").trim(),
    sourceCategory: String(formData.get("testSourceCategory") || "").trim(),
    allowedAssets: String(formData.get("testAllowedAssets") || "").trim(),
    relevantSectors: String(formData.get("testRelevantSectors") || "").trim(),
    rawText: String(formData.get("testRawText") || ""),
    runLive: formData.get("testRunLive") === "on"
  };
}

async function runTestDrive(form, { forceLive = null } = {}) {
  const payload = buildTestDrivePayload(form);

  if (forceLive != null) {
    payload.runLive = forceLive;
  }

  state.testDraft = {
    ...payload
  };
  state.testRunError = "";
  state.testRunData = null;
  state.isTestRunLoading = true;
  render();

  try {
    const response = await fetch("/api/engine/test-drive", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Test run failed with ${response.status}`));
    }

    state.testRunData = await response.json();
  } catch (error) {
    state.testRunError = error instanceof Error ? error.message : "Failed to run the ad hoc test.";
  } finally {
    state.isTestRunLoading = false;
    render();
  }
}

async function loadPipelineRunDetail({ runId = state.selectedRunId, silent = false } = {}) {
  if (!runId) {
    return;
  }

  if (state.selectedRunId !== runId) {
    state.selectedRunDetail = null;
  }

  state.selectedRunId = runId;
  state.runDetailError = "";
  state.isRunDetailLoading = true;

  if (!silent) {
    render();
  }

  try {
    const response = await fetch(`/api/pipeline/runs/${encodeURIComponent(runId)}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Pipeline run request failed with ${response.status}`));
    }

    const payload = await response.json();
    state.selectedRunDetail = payload.run || null;
  } catch (error) {
    state.runDetailError = error instanceof Error ? error.message : "Failed to load pipeline run.";
  } finally {
    state.isRunDetailLoading = false;
    render();
  }
}

async function loadEvalRunDetail({ evalId = state.selectedEvalId, silent = false } = {}) {
  if (!evalId) {
    return;
  }

  if (state.selectedEvalId !== evalId) {
    state.selectedEvalDetail = null;
  }

  state.selectedEvalId = evalId;
  state.evalDetailError = "";
  state.isEvalDetailLoading = true;

  if (!silent) {
    render();
  }

  try {
    const response = await fetch(`/api/evals/history/${encodeURIComponent(evalId)}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(await parseError(response, `Eval run request failed with ${response.status}`));
    }

    const payload = await response.json();
    state.selectedEvalDetail = payload.run || null;
  } catch (error) {
    state.evalDetailError = error instanceof Error ? error.message : "Failed to load eval run.";
  } finally {
    state.isEvalDetailLoading = false;
    render();
  }
}

function setView(view) {
  if (!state.developerMode && isDeveloperView(view)) {
    state.view = "dashboard";
    render();
    return;
  }

  state.view = view;
  if (view === "admin" && state.selectedReplayPostId && !state.replayData) {
    loadReplay({
      postId: state.selectedReplayPostId,
      silent: true
    });
  }
  if (view === "logs") {
    if (state.selectedRunId && !state.selectedRunDetail) {
      loadPipelineRunDetail({
        runId: state.selectedRunId,
        silent: true
      });
    }
    if (state.selectedEvalId && !state.selectedEvalDetail) {
      loadEvalRunDetail({
        evalId: state.selectedEvalId,
        silent: true
      });
    }
  }
  render();
}

function setDeveloperMode(enabled) {
  state.developerMode = Boolean(enabled);
  persistStoredFlag(DEVELOPER_STORAGE_KEY, state.developerMode);

  if (!state.developerMode && isDeveloperView(state.view)) {
    state.view = "dashboard";
  }

  render();
}

function setAsset(ticker) {
  state.selectedAsset = ticker;
  state.view = "assets";
  render();
}

function setSource(sourceId) {
  state.selectedSource = sourceId;
  state.view = "sources";
  render();
}

function setActionFilter(filter) {
  state.actionFilter = filter;
  render();
}

function attachListeners() {
  document.querySelectorAll("[data-toggle-developer-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setDeveloperMode(button.dataset.toggleDeveloperMode === "1");
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelectorAll("[data-asset]").forEach((button) => {
    button.addEventListener("click", () => setAsset(button.dataset.asset));
  });

  document.querySelectorAll("[data-source]").forEach((button) => {
    button.addEventListener("click", () => setSource(button.dataset.source));
  });

  document.querySelectorAll("[data-action-filter]").forEach((button) => {
    button.addEventListener("click", () => setActionFilter(button.dataset.actionFilter));
  });

  document.querySelectorAll("[data-review-decision]").forEach((button) => {
    button.addEventListener("click", () => {
      updateDecisionReview(button.dataset.reviewDecision, button.dataset.reviewStatus);
    });
  });

  document.querySelectorAll("[data-post-verification-override]").forEach((button) => {
    button.addEventListener("click", () => {
      togglePostVerificationOverride(
        button.dataset.postVerificationOverride,
        button.dataset.postVerificationEnabled === "1"
      );
    });
  });

  document.querySelectorAll("[data-refresh]").forEach((button) => {
    button.addEventListener("click", () => loadData({ refresh: true }));
  });

  document.querySelectorAll("[data-retry]").forEach((button) => {
    button.addEventListener("click", () => loadData());
  });

  document.querySelectorAll("[data-reseed-fake-tweets]").forEach((button) => {
    button.addEventListener("click", () => reseedFakeTweets());
  });

  document.querySelectorAll("[data-run-pipeline]").forEach((button) => {
    button.addEventListener("click", () => runPipelineFromOperator());
  });

  document.querySelectorAll("[data-run-evals]").forEach((button) => {
    button.addEventListener("click", () => runEvalsFromOperator());
  });

  document.querySelectorAll("[data-send-digest]").forEach((button) => {
    button.addEventListener("click", () => sendDigestFromOperator());
  });

  document.querySelectorAll("[data-test-notification]").forEach((button) => {
    button.addEventListener("click", () => sendTestNotificationFromOperator());
  });

  document.querySelectorAll("[data-new-source]").forEach((button) => {
    button.addEventListener("click", () => setEditingSource(""));
  });

  document.querySelectorAll("[data-edit-source]").forEach((button) => {
    button.addEventListener("click", () => setEditingSource(button.dataset.editSource));
  });

  document.querySelectorAll("[data-delete-source]").forEach((button) => {
    button.addEventListener("click", () => deleteOperatorSource(button.dataset.deleteSource));
  });

  document.querySelectorAll("[data-source-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitSourceForm(form);
    });
  });

  document.querySelectorAll("[data-edit-research]").forEach((button) => {
    button.addEventListener("click", () => setEditingResearch(button.dataset.editResearch));
  });

  document.querySelectorAll("[data-cancel-research-edit]").forEach((button) => {
    button.addEventListener("click", () => setEditingResearch(""));
  });

  document.querySelectorAll("[data-delete-research]").forEach((button) => {
    button.addEventListener("click", () => deleteOperatorResearch(button.dataset.deleteResearch));
  });

  document.querySelectorAll("[data-research-status]").forEach((button) => {
    button.addEventListener("click", () =>
      updateResearchStatus(button.dataset.researchStatus, button.dataset.nextStatus)
    );
  });

  document.querySelectorAll("[data-research-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitResearchForm(form);
    });
  });

  document.querySelectorAll("[data-manual-feed-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      importManualFeed(form);
    });
  });

  document.querySelectorAll("[data-test-drive-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      runTestDrive(form);
    });
  });

  document.querySelectorAll("[data-rerun-test-live]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = document.querySelector("[data-test-drive-form]");

      if (!form) {
        return;
      }

      runTestDrive(form, {
        forceLive: true
      });
    });
  });

  document.querySelectorAll("[data-select-replay-post]").forEach((button) => {
    button.addEventListener("click", () => {
      loadReplay({
        postId: button.dataset.selectReplayPost
      });
    });
  });

  document.querySelectorAll("[data-refresh-replay]").forEach((button) => {
    button.addEventListener("click", () => {
      loadReplay({
        postId: state.selectedReplayPostId
      });
    });
  });

  document.querySelectorAll("[data-live-replay]").forEach((button) => {
    button.addEventListener("click", () => {
      loadReplay({
        postId: state.selectedReplayPostId,
        live: true
      });
    });
  });

  document.querySelectorAll("[data-select-run]").forEach((button) => {
    button.addEventListener("click", () => {
      loadPipelineRunDetail({
        runId: button.dataset.selectRun
      });
    });
  });

  document.querySelectorAll("[data-select-eval]").forEach((button) => {
    button.addEventListener("click", () => {
      loadEvalRunDetail({
        evalId: button.dataset.selectEval
      });
    });
  });

  document.querySelectorAll("[data-profile-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveFinancialProfile(form);
    });
  });

  document.querySelectorAll("[data-onboarding-step]").forEach((button) => {
    button.addEventListener("click", () => {
      hydrateProfileDraftFromForm(button.closest("form"));
      setProfileOnboardingStep(button.dataset.onboardingStep);
      render();
    });
  });

  document.querySelectorAll("[data-onboarding-next]").forEach((button) => {
    button.addEventListener("click", () => {
      hydrateProfileDraftFromForm(button.closest("form"));
      setProfileOnboardingStep(state.profileOnboardingStep + 1);
      render();
    });
  });

  document.querySelectorAll("[data-onboarding-prev]").forEach((button) => {
    button.addEventListener("click", () => {
      hydrateProfileDraftFromForm(button.closest("form"));
      setProfileOnboardingStep(state.profileOnboardingStep - 1);
      render();
    });
  });

  document.querySelectorAll("[data-add-profile-item]").forEach((button) => {
    button.addEventListener("click", () => {
      hydrateProfileDraftFromForm(button.closest("form"));
      addProfileCollectionItem(button.dataset.addProfileItem);
    });
  });

  document.querySelectorAll("[data-remove-profile-item]").forEach((button) => {
    button.addEventListener("click", () => {
      hydrateProfileDraftFromForm(button.closest("form"));
      const [collection, index] = String(button.dataset.removeProfileItem || "").split(":");
      removeProfileCollectionItem(collection, index);
    });
  });

  document.querySelectorAll("[data-profile-item-field]").forEach((input) => {
    input.addEventListener("input", () => {
      updateProfileCollectionItem(input.dataset.collection, input.dataset.index, input.dataset.field, input.value);
    });

    input.addEventListener("change", () => {
      updateProfileCollectionItem(input.dataset.collection, input.dataset.index, input.dataset.field, input.value);
    });
  });

  document.querySelectorAll("[data-profile-documents]").forEach((input) => {
    input.addEventListener("change", () => {
      const existingDraft = getProfileDocumentDraft();
      const nextDraft = [
        ...existingDraft,
        ...Array.from(input.files || []).map((file, index) => ({
          id: `upload-${Date.now()}-${index}`,
          name: file.name,
          category: "Uploaded contract",
          sizeBytes: Number(file.size || 0),
          lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : "",
          notes: ""
        }))
      ];
      state.profileDocumentDraft = nextDraft;
      getProfileDraft().documents = nextDraft;
      input.value = "";
      render();
    });
  });

  document.querySelectorAll("[data-remove-document]").forEach((button) => {
    button.addEventListener("click", () => {
      state.profileDocumentDraft = getProfileDocumentDraft().filter((item) => item.id !== button.dataset.removeDocument);
      getProfileDraft().documents = state.profileDocumentDraft;
      render();
    });
  });

  document.querySelectorAll("[data-advisor-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      askAdvisor(form);
    });
  });
}

function renderEmptyState(title, copy) {
  return `
    <main class="content-shell">
      <section class="section-card empty-card">
        <span class="eyebrow">No data yet</span>
        <h2>${title}</h2>
        <p>${copy}</p>
        <button class="refresh-button" data-retry>Retry loading snapshot</button>
      </section>
    </main>
  `;
}

function renderStatusBanner() {
  if (state.error) {
    return `
      <section class="section-card status-banner status-error">
        <div>
          <span class="eyebrow">Snapshot issue</span>
          <h3>Latest refresh failed</h3>
          <p>${state.error}</p>
        </div>
        <button class="refresh-button" data-retry>Retry</button>
      </section>
    `;
  }

  const bootstrap = getData().runtime?.bootstrap || EMPTY_DATA.runtime.bootstrap;

  if (bootstrap.status === "degraded" && bootstrap.lastError) {
    return `
      <section class="section-card status-banner">
        <div>
          <span class="eyebrow">Startup Warning</span>
          <h3>Running on the last good snapshot</h3>
          <p>${escapeHtml(bootstrap.lastError)}</p>
        </div>
        <button class="refresh-button" data-run-pipeline>Run pipeline</button>
      </section>
    `;
  }

  if (state.isRefreshing) {
    return `
      <section class="section-card status-banner">
        <div>
          <span class="eyebrow">Refreshing</span>
          <h3>Pulling the latest local snapshot</h3>
          <p>The current view stays visible while the app reloads the stored feed and decision data.</p>
        </div>
      </section>
    `;
  }

  return "";
}

function renderLoading() {
  return `
    <main class="content-shell">
      <section class="hero-panel">
        <div>
          <span class="eyebrow">Loading</span>
          <h2>Preparing your daily brief.</h2>
          <p>The app is loading your feed, decisions, and saved portfolio context.</p>
        </div>
        <div class="hero-decision">
          <span class="pill pill-muted">Status</span>
          <strong>Request in flight</strong>
          <p>Today, Feed, Decisions, and Advisor will appear as soon as the snapshot lands.</p>
        </div>
      </section>
      <section class="loading-shell">
        <div class="loading-card"></div>
        <div class="loading-card"></div>
        <div class="loading-card"></div>
      </section>
    </main>
  `;
}

function renderStatCards() {
  const { sources, clusters, posts, decisions } = getData();
  const buyCount = decisions.filter((decision) => decision.action === "BUY").length;
  const holdCount = decisions.filter((decision) => decision.action === "HOLD").length;
  const sellCount = decisions.filter((decision) => decision.action === "SELL").length;
  const averageConfidence =
    decisions.length
      ? decisions.reduce((sum, decision) => sum + decision.confidence, 0) / decisions.length
      : 0;

  return `
    <section class="stat-grid">
      <article class="stat-card">
        <span class="eyebrow">Coverage</span>
        <strong>${sources.length}</strong>
        <p>monitored X accounts across policy, macro, sector, operator, and crypto signal types.</p>
      </article>
      <article class="stat-card">
        <span class="eyebrow">Active book</span>
        <strong>${buyCount} / ${holdCount} / ${sellCount}</strong>
        <p>live BUY, HOLD, and SELL recommendations in the focused AI/tech universe.</p>
      </article>
      <article class="stat-card">
        <span class="eyebrow">Clustering</span>
        <strong>${clusters.length}</strong>
        <p>event narratives collapsed from ${posts.length} raw posts inside the 12-hour decision window.</p>
      </article>
      <article class="stat-card">
        <span class="eyebrow">Explainability</span>
        <strong>${formatPercent(averageConfidence)}</strong>
        <p>average decision confidence, always paired with explicit why-not and uncertainty notes.</p>
      </article>
    </section>
  `;
}

function renderNav() {
  const profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile;
  const metadata = getData().metadata || EMPTY_DATA.metadata;
  const feedMode = getFeedMode();
  const setupState = buildSingleUserSetupState(profile);
  const researchSummary = getResearchSummary();
  const reviewSummary = getReviewSummary();
  const trackedAssets = buildTrackedPortfolioAnalytics(profile).trackedAssets.length;
  const scheduler = getRuntime().scheduler || EMPTY_DATA.runtime.scheduler;
  const primaryItems = [
    ["dashboard", "Today", reviewSummary.proposedCount ? `${reviewSummary.proposedCount} to review` : "Clear"],
    ["setup", "Portfolio", trackedAssets ? `${trackedAssets} tracked` : "Start here"],
    ["signals", "Feed", `${getRecentAnalysedPosts().length} posts`],
    [
      "decisions",
      "Decisions",
      `${
        reviewSummary.proposedCount ||
        researchSummary.candidateCount ||
        getData().decisions.length ||
        0
      } active`
    ],
    ["advisor", "Advisor", getAdvisor().history.length ? `${getAdvisor().history.length} answers` : "Ask away"]
  ];
  const developerItems = [
    ["admin", "Operations"],
    ["tests", "Tests"],
    ["sources", "Sources"],
    ["logs", "Logs"],
    ["docs", "Docs"]
  ];
  const activePrimary = getPrimaryView();

  return `
    <header class="office-header">
      <div class="office-titlebar">
        <div class="office-brand">
          <img class="office-logo-lockup" src="/logo.svg" alt="X Ticker Investment" width="320" height="93" />
          <div class="office-brand-copy">
            <span class="eyebrow">Supervised AI investing desk</span>
            <strong>Simple daily loop</strong>
            <p>Feed, research, approval, and advice without the cockpit overload.</p>
          </div>
        </div>
        <div class="office-meta">
          <div class="office-meta-pill">
            <span>Updated</span>
            <strong>${formatGeneratedAt(metadata.generatedAt)}</strong>
          </div>
          <div class="office-meta-pill">
            <span>Feed</span>
            <strong>${formatEnumLabel(feedMode)}</strong>
          </div>
          <div class="office-meta-pill">
            <span>Scheduler</span>
            <strong>${scheduler.active ? scheduler.scheduleDescription || "Scheduled" : "Manual"}</strong>
          </div>
          <div class="office-meta-pill">
            <span>Setup</span>
            <strong>${setupState.completedCount}/4</strong>
          </div>
          <button class="refresh-button office-refresh" data-refresh>
            ${state.isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            class="developer-toggle ${state.developerMode ? "is-active" : ""}"
            type="button"
            data-toggle-developer-mode="${state.developerMode ? "0" : "1"}"
          >
            ${state.developerMode ? "Developer mode on" : "Developer mode"}
          </button>
        </div>
      </div>
      <div class="office-tabs">
        ${primaryItems
          .map(
            ([view, label, value]) => `
            <button class="office-tab ${activePrimary === view ? "is-active" : ""}" data-view="${view}">
              <span>${label}</span>
              <small>${value}</small>
            </button>
          `
          )
          .join("")}
      </div>
      ${
        state.developerMode
          ? `
            <div class="developer-tray">
              <div>
                <span class="eyebrow">Developer mode</span>
                <p>Diagnostics and low-level tooling stay here so the main product flow stays focused.</p>
              </div>
              <div class="developer-chip-row">
                ${developerItems
                  .map(
                    ([view, label]) => `
                      <button class="mini-chip developer-chip ${state.view === view ? "is-active" : ""}" data-view="${view}">
                        ${label}
                      </button>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
          : ""
      }
    </header>
  `;
}

function renderHero() {
  const { metadata, decisions, clusters } = getData();
  const leadDecision = getDecisionByAsset("NVDA") || decisions[0];
  const leadCluster = getCluster("cluster-accelerators") || clusters[0];

  return `
    <section class="hero-panel">
      <div>
        <div class="hero-actions">
          <span class="pill">${metadata.snapshotLabel}</span>
          <span class="subtle">Updated ${formatGeneratedAt(metadata.generatedAt)}</span>
        </div>
        <span class="eyebrow">Current lead narrative</span>
        <h2>${leadCluster?.title || "No lead narrative available yet"}</h2>
        <p>${leadCluster?.summary || "Once the local API returns data, the highest-signal cluster will appear here."}</p>
        <div class="tag-row">
          <span class="tag">${metadata.universeFocus}</span>
          <span class="tag">${metadata.latencyWindow}</span>
          <span class="tag">${metadata.tweetFeedCount} fetched tweets via ${metadata.engineMode || metadata.tweetFeedMode}</span>
        </div>
      </div>
      <div class="hero-decision">
        <div class="decision-badge decision-${(leadDecision?.action || "hold").toLowerCase()}">${leadDecision?.action || "WAIT"}</div>
        <strong>${leadDecision?.asset || "Snapshot pending"}</strong>
        <span>${leadDecision?.horizon || "Hydrating"}</span>
        <p>${leadDecision?.rationale?.[0] || "Explainable decision support will appear here once the snapshot is loaded."}</p>
        <button class="refresh-button" data-refresh>${state.isRefreshing ? "Refreshing..." : "Refresh snapshot"}</button>
      </div>
    </section>
  `;
}

function renderAdminPage() {
  const history = getHistory();
  const evaluation = getEvaluation();
  const runtime = getRuntime();
  const latestRun = history.runs[0] || null;
  const latestEval = evaluation.latestRun || evaluation.history[0] || null;
  const quickLinks = [
    ["tests", "Tests"],
    ["logs", "Run history"],
    ["sources", "Sources"],
    ["assets", "Assets"],
    ["docs", "Rules"]
  ];

  return `
    <main class="office-content">
      ${renderStatusBanner()}
      ${renderOperatorNotice()}
      <section class="office-panel office-summary-panel">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Operations</span>
            <h2>Runtime controls</h2>
          </div>
        </div>
        <div class="office-summary-grid">
          <article class="office-metric">
            <span>Latest pipeline</span>
            <strong>${latestRun ? formatShortId(latestRun.id) : "None"}</strong>
            <small>${latestRun ? formatGeneratedAt(latestRun.generatedAt) : "Run the first pipeline"}</small>
          </article>
          <article class="office-metric">
            <span>Latest eval</span>
            <strong>${latestEval ? formatScorePercent(latestEval.summary.averageScore) : "Pending"}</strong>
            <small>${latestEval ? latestEval.promptVersion : "No evals yet"}</small>
          </article>
          <article class="office-metric">
            <span>Scheduler</span>
            <strong>${runtime.scheduler.active ? "Active" : "Off"}</strong>
            <small>${runtime.scheduler.active ? runtime.scheduler.scheduleDescription || "Scheduled" : "Manual only"}</small>
          </article>
          <article class="office-metric">
            <span>Feed mode</span>
            <strong>${formatEnumLabel(getFeedMode())}</strong>
            <small>${getStoreStatus().postCount || 0} posts in store</small>
          </article>
        </div>
      </section>
      <section class="office-grid office-grid-two">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Actions</span>
              <h3>Run and notify</h3>
            </div>
          </div>
          <div class="office-action-list">
            <button class="refresh-button" type="button" data-run-pipeline ${state.isRunningPipeline ? "disabled" : ""}>${state.isRunningPipeline ? "Running pipeline..." : "Run pipeline"}</button>
            <button class="mini-chip" type="button" data-run-evals ${state.isRunningEvals ? "disabled" : ""}>${state.isRunningEvals ? "Running evals..." : "Run evals"}</button>
            <button class="mini-chip" type="button" data-send-digest ${state.isSendingDigest ? "disabled" : ""}>${state.isSendingDigest ? "Sending digest..." : "Send digest"}</button>
            <button class="mini-chip" type="button" data-test-notification ${state.isTestingNotification ? "disabled" : ""}>${state.isTestingNotification ? "Testing..." : "Test notification"}</button>
            <button class="mini-chip" type="button" data-reseed-fake-tweets ${state.isReseeding ? "disabled" : ""}>${state.isReseeding ? "Reseeding..." : "Reseed fake feed"}</button>
          </div>
        </section>
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Deep links</span>
              <h3>Advanced pages</h3>
            </div>
          </div>
          <div class="office-link-list">
            ${quickLinks
              .map(
                ([view, label]) => `
                  <button class="office-link-row" data-view="${view}">
                    <span>${label}</span>
                  </button>
                `
              )
              .join("")}
          </div>
        </section>
      </section>
    </main>
  `;
}

function renderPipeline() {
  const { pipeline } = getData();

  return `
    <section class="section-card">
      <div class="section-header">
        <div>
          <span class="eyebrow">Decision framework</span>
          <h3>Posts -> claims -> clusters -> policy -> decision</h3>
        </div>
        <p class="section-copy">The product doc explicitly avoids a tweet-to-LLM-to-trade loop. This layout keeps that guardrail visible.</p>
      </div>
      <div class="pipeline-grid">
        ${pipeline
          .map(
            (item, index) => `
            <article class="pipeline-card">
              <span class="pipeline-index">0${index + 1}</span>
              <strong>${item.stage}</strong>
              <p>${item.description}</p>
            </article>
          `
          )
          .join("")}
      </div>
    </section>
  `;
}

function buildOnboardingSummary(profile) {
  const holdingsTotal = (profile.holdings || []).reduce((sum, item) => sum + Number(item.currentValue || 0), 0);
  const retirementTotal = (profile.retirementProducts || []).reduce(
    (sum, item) => sum + Number(item.currentValue || 0),
    0
  );
  const liabilitiesTotal = (profile.liabilities || []).reduce((sum, item) => sum + Number(item.balance || 0), 0);

  return {
    holdingsTotal,
    retirementTotal,
    liabilitiesTotal,
    documentCount: (getProfileDocumentDraft() || []).length,
    trackedAssetCount: getTrackedAssetTickers(profile).length
  };
}

function getFeedMode() {
  return getStoreStatus().mode || getData().metadata.tweetFeedMode || "fake";
}

function buildSingleUserSetupState(profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile) {
  const summary = buildOnboardingSummary(profile);
  const recentPosts = getRecentAnalysedPosts();
  const feedMode = getFeedMode();
  const hasDecisionFrame = Boolean(
    profile.investorName ||
      profile.investmentHorizon ||
      profile.goals?.length ||
      profile.watchlist?.length ||
      profile.riskTolerance
  );
  const hasCashContext = Boolean(
    Number(profile.monthlyNetIncome || 0) ||
      Number(profile.monthlyExpenses || 0) ||
      Number(profile.emergencyFund || 0) ||
      (profile.liabilities || []).length ||
      profile.liquidityNeeds
  );
  const hasPortfolioContext = Boolean(
    summary.trackedAssetCount ||
      (profile.retirementProducts || []).length ||
      summary.documentCount
  );
  const hasRealSignalInput = feedMode !== "fake" && recentPosts.length > 0;
  const steps = [
    {
      key: "frame",
      title: "Decision frame",
      body: hasDecisionFrame
        ? "Goals, watchlist, and investing context are saved."
        : "Add the few goals and tickers you actually want this app to watch.",
      complete: hasDecisionFrame,
      actionView: "setup"
    },
    {
      key: "cash",
      title: "Cash and obligations",
      body: hasCashContext
        ? "Liquidity, burn, and liabilities are available for portfolio-aware answers."
        : "Add income, expenses, emergency fund, or liabilities to ground the advice.",
      complete: hasCashContext,
      actionView: "setup"
    },
    {
      key: "portfolio",
      title: "Portfolio context",
      body: hasPortfolioContext
        ? `${summary.trackedAssetCount} tracked assets and ${formatCurrency(
            summary.holdingsTotal + summary.retirementTotal
          )} of invested assets are in scope.`
        : "Add holdings, pensions, or insurance wrappers so the brief can prioritize real positions.",
      complete: hasPortfolioContext,
      actionView: "setup"
    },
    {
      key: "signals",
      title: "Real signal feed",
      body: hasRealSignalInput
        ? `${recentPosts.length} recent posts are flowing through ${formatEnumLabel(feedMode)} mode.`
        : feedMode === "fake"
          ? "You are still on the seeded demo feed. Manual import or X sync is the last step before this becomes personal."
          : "Switch from demo data to manual or live X input, then the brief becomes useful day to day.",
      complete: hasRealSignalInput,
      actionView: "setup"
    }
  ];

  return {
    steps,
    completedCount: steps.filter((step) => step.complete).length,
    nextStep: steps.find((step) => !step.complete) || steps[steps.length - 1],
    hasDecisionFrame,
    hasCashContext,
    hasPortfolioContext,
    hasRealSignalInput
  };
}

function buildSingleUserImpactCards(profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile) {
  const setupState = buildSingleUserSetupState(profile);
  const trackedTickers = getTrackedAssetTickers(profile);
  const latestAnswer = getLatestAdvisorAnswer();

  return [
    {
      title: "Daily loop",
      label: "Most important",
      body: trackedTickers.length
        ? "The brief and advisor are the only surfaces most local users should need every day."
        : "The brief only becomes personal after you save a watchlist or a few real holdings."
    },
    {
      title: "Setup chores",
      label: "Occasional",
      body: "Holdings import, cash context, and manual signal paste are setup tasks. They should feel sequential, not like separate products."
    },
    {
      title: "Optional automation",
      label: "Later",
      body: setupState.hasRealSignalInput
        ? "Live X sync, digests, and scheduler runs are convenience layers once the manual flow already feels right."
        : "Live X sync and notifications matter later, but they should not block the first useful session."
    },
    {
      title: "Advanced tooling",
      label: "Background",
      body: latestAnswer
        ? "Replay, evals, sources, and run history still matter for tuning, but they belong in Workspace."
        : "Replay, evals, docs, and source tuning are valuable for maintenance, but they should stay off the critical path."
    }
  ];
}

function renderOnboardingStepCards(currentStep) {
  const steps = [
    {
      title: "Profile",
      body: "Goals, risk language, horizon, and the assets you care about."
    },
    {
      title: "Cash & Cover",
      body: "Income, reserves, liabilities, pensions, and insurance products."
    },
    {
      title: "Assets",
      body: "Add the holdings you actually own and save the portfolio."
    }
  ];

  return `
    <div class="onboarding-stepper">
      ${steps
        .map(
          (step, index) => `
          <button
            class="onboarding-step ${index === currentStep ? "is-active" : index < currentStep ? "is-complete" : ""}"
            type="button"
            data-onboarding-step="${index}"
          >
            <span class="onboarding-step-index">0${index + 1}</span>
            <span class="onboarding-step-copy">
              <strong>${step.title}</strong>
              <small>${step.body}</small>
            </span>
          </button>
        `
        )
        .join("")}
    </div>
  `;
}

function renderOperatorNotice() {
  if (!state.operatorNotice) {
    return "";
  }

  return `
    <section class="section-card status-banner status-success">
      <div>
        <span class="eyebrow">Operator update</span>
        <h3>Action completed</h3>
        <p>${state.operatorNotice}</p>
      </div>
    </section>
  `;
}

function renderReplayInspector() {
  const replayCandidates = getRecentAnalysedPosts().slice(0, 10);
  const replay = state.replayData;
  const extractor = getEngine().extractor || EMPTY_DATA.engine.extractor;

  return `
    <section class="section-card">
      <div class="section-header">
        <div>
          <span class="eyebrow">Extraction replay</span>
          <h3>Inspect prompt, cache, and normalized output per post</h3>
        </div>
        <p class="section-copy">This inspector is built for prompt work before a live key is configured. Once the model is enabled, the same panel can run one-off live extraction replays.</p>
      </div>
      <div class="replay-shell">
        <div class="replay-list">
          ${replayCandidates
            .map((post) => {
              const source = getSource(post.sourceId);

              return `
                <button class="replay-button ${state.selectedReplayPostId === post.id ? "is-active" : ""}" data-select-replay-post="${post.id}">
                  <strong>${source?.handle || post.sourceId}</strong>
                  <span>${post.timestamp}</span>
                  <p>${post.body}</p>
                </button>
              `;
            })
            .join("")}
        </div>
        <div class="replay-panel">
          <div class="toolbar-row">
            <span class="pill pill-muted">${extractor.activeMode || "heuristic"}</span>
            <div class="filter-row">
              <button class="mini-chip" data-refresh-replay ${state.selectedReplayPostId ? "" : "disabled"}>Refresh replay</button>
              <button class="mini-chip" data-live-replay ${extractor.activeMode === "openai" && state.selectedReplayPostId ? "" : "disabled"}>Run live extraction</button>
            </div>
          </div>
          ${
            state.replayError
              ? `
                <article class="status-inline status-inline-error">
                  <strong>Replay error</strong>
                  <p>${state.replayError}</p>
                </article>
              `
              : ""
          }
          ${
            state.isReplayLoading
              ? `
                <article class="status-inline">
                  <strong>Loading replay</strong>
                  <p>Pulling the replay data for ${state.selectedReplayPostId || "the selected post"}.</p>
                </article>
              `
              : replay
                ? `
                  <div class="context-grid">
                    <article class="context-item">
                      <span>Prompt version</span>
                      <strong>${replay.replay.promptVersion}</strong>
                    </article>
                    <article class="context-item">
                      <span>Prompt label</span>
                      <strong>${replay.replay.promptGuide?.label || "Prompt bundle"}</strong>
                    </article>
                    <article class="context-item">
                      <span>Cache hit</span>
                      <strong>${replay.replay.cache.hit ? "Yes" : "No"}</strong>
                    </article>
                    <article class="context-item">
                      <span>Replay mode</span>
                      <strong>${replay.replay.config.activeMode}</strong>
                    </article>
                    <article class="context-item">
                      <span>Model</span>
                      <strong>${replay.replay.config.model || "Not configured"}</strong>
                    </article>
                    <article class="context-item">
                      <span>Calibration examples</span>
                      <strong>${replay.replay.validationReady?.exampleCount || 0}</strong>
                    </article>
                  </div>
                  <article class="operator-card">
                    <div class="operator-card-head">
                      <div>
                        <strong>${replay.source?.handle || replay.rawPost.sourceId}</strong>
                        <span>${replay.rawPost.timestamp || replay.rawPost.createdAt}</span>
                      </div>
                      <span class="pill">${replay.currentSnapshotPost?.clusterId || "pending"}</span>
                    </div>
                  <p>${replay.rawPost.body}</p>
                  <div class="tag-row">
                    <span class="tag">${replay.currentSnapshotPost?.claimType || "Pending"}</span>
                    <span class="tag">${replay.currentSnapshotPost?.direction || "Pending"}</span>
                    <span class="tag">${replay.currentSnapshotPost?.actionable ? "Actionable" : "Filtered down"}</span>
                    ${renderPostVerificationTag(replay.currentSnapshotPost || {})}
                  </div>
                  ${renderPostVerificationNote(replay.currentSnapshotPost || {})}
                  ${renderPostVerificationControls(replay.currentSnapshotPost || {})}
                </article>
                  <details open>
                    <summary>Current normalized output</summary>
                    ${renderJsonBlock(replay.currentSnapshotPost)}
                  </details>
                  <details>
                    <summary>Heuristic baseline</summary>
                    ${renderJsonBlock(replay.heuristicBaseline)}
                  </details>
                  <details>
                    <summary>Prompt guide and validation focus</summary>
                    ${renderJsonBlock(replay.replay.promptGuide)}
                  </details>
                  <details>
                    <summary>Calibration examples</summary>
                    ${renderJsonBlock(replay.replay.promptGuide?.examples || [])}
                  </details>
                  <details>
                    <summary>Cached extraction payload</summary>
                    ${
                      replay.replay.cache.hit
                        ? renderJsonBlock(replay.replay.cache.entry)
                        : '<article class="status-inline"><strong>No cached extraction yet</strong><p>This post has not been persisted through the model-backed extractor yet.</p></article>'
                    }
                  </details>
                  <details>
                    <summary>Extraction request envelope</summary>
                    ${renderJsonBlock(replay.replay.requestEnvelope)}
                  </details>
                  <details>
                    <summary>One-off live run</summary>
                    ${
                      replay.replay.liveRun
                        ? renderJsonBlock(replay.replay.liveRun)
                        : `<article class="status-inline"><strong>Live run not executed</strong><p>${replay.replay.validationReady?.liveEligible ? "A live run is available for this post." : "Once an API key is configured, this panel can run a single live extraction for the selected post."}</p></article>`
                    }
                  </details>
                `
                : `
                  <article class="status-inline">
                    <strong>Select a post</strong>
                    <p>Pick a recent analysed tweet to inspect the extractor request and output path.</p>
                  </article>
                `
          }
        </div>
      </div>
    </section>
  `;
}

function buildTestTraceItems(testRun) {
  const replay = testRun?.replay || {};
  const impactReplay = testRun?.impactReplay || {};
  const source = testRun?.source || {};
  const selectedNormalized =
    testRun?.selectedNormalized || testRun?.liveNormalized || testRun?.cachedNormalized || testRun?.heuristicBaseline || null;
  const mappedAssets = Array.isArray(selectedNormalized?.mappedAssets) ? selectedNormalized.mappedAssets : [];
  const likelyImpacts = getLikelyImpacts(selectedNormalized || testRun?.rawPost || {});
  const liveStage = replay.liveRun
    ? replay.liveRun.ok
      ? {
          status: "success",
          summary: "The model returned a one-off live extraction for this test input."
        }
      : {
          status: "warning",
          summary: replay.liveRun.error || "The live extraction request failed."
        }
    : replay.validationReady?.liveEligible
      ? {
          status: "neutral",
          summary: "Live extraction was skipped for this run."
        }
        : {
            status: "neutral",
            summary: "The extractor is not in model-backed mode, so only heuristic analysis ran."
          };
  const impactStage = impactReplay.liveRun
    ? impactReplay.liveRun.ok
      ? {
          status: "success",
          summary: "The impact mapper ranked likely affected names from the tracked universe."
        }
      : {
          status: "warning",
          summary: impactReplay.liveRun.error || "The live impact-mapping request failed."
        }
    : impactReplay.validationReady?.liveEligible
      ? {
          status: "neutral",
          summary: "Live impact mapping was skipped for this run."
        }
        : {
            status: "neutral",
            summary: "The impact mapper is not in hosted-model mode, so no AI-ranked impacts were generated."
          };
  const impactCacheStage = impactReplay.cache?.hit
    ? {
        status: "success",
        summary: "A cached impact-ranking result already existed for this normalized post and watched-universe context."
      }
    : {
        status: "neutral",
        summary: "No cached impact-ranking result matched this test input."
      };

  return [
    {
      label: "Input staged",
      status: "success",
      summary: `${source.handle || "Unknown source"} with ${(source.allowedAssets || []).length || 0} allowed assets and ${String(testRun?.rawPost?.body || "").length} characters.`
    },
    {
      label: "Heuristic baseline",
      status: "success",
      summary: `${testRun?.heuristicBaseline?.claimType || "Pending"} -> ${testRun?.heuristicBaseline?.clusterId || "pending"} (${(testRun?.heuristicBaseline?.mappedAssets || []).join(", ") || "Unmapped"}).`
    },
    {
      label: "Prompt request",
      status: "success",
      summary: `${replay.config?.activeMode || "heuristic"} · ${replay.config?.model || "No hosted model"} · ${replay.validationReady?.exampleCount || 0} calibration examples.`
    },
    {
      label: "Cache lookup",
      status: replay.cache?.hit ? "success" : "neutral",
      summary: replay.cache?.hit
        ? "A cached extraction already existed for the same prompt/model fingerprint."
        : "No cached extraction matched this test input."
    },
    {
      label: "Live extraction",
      status: liveStage.status,
      summary: liveStage.summary
    },
    {
      label: "Normalized output",
      status: "success",
      summary: `${selectedNormalized?.claimType || "Pending"} · ${selectedNormalized?.direction || "Pending"} · ${selectedNormalized?.clusterId || "pending"}`
    },
    {
      label: "Verification gate",
      status: getPostVerificationInfo(selectedNormalized || {}).blocksActionability
        ? "warning"
        : getPostVerificationInfo(selectedNormalized || {}).status === "trusted"
          ? "neutral"
          : "success",
      summary:
        getPostVerificationInfo(selectedNormalized || {}).note ||
        "This signal did not need an extra reliability gate."
    },
    {
      label: "Asset mapping",
      status: getAssetMappingInfo(selectedNormalized || {}).requiresReview ? "warning" : "success",
      summary: mappedAssets.length
        ? `${mappedAssets.join(", ")} · ${getAssetMappingInfo(selectedNormalized || {}).label}`
        : "Unmapped after normalization."
    },
    {
      label: "Impact request",
      status: impactReplay.validationReady?.liveEligible ? "success" : "neutral",
      summary: `${impactReplay.config?.activeMode || "disabled"} · ${impactReplay.config?.model || "No hosted model"} · ${impactReplay.validationReady?.candidateCount || 0} candidate assets.`
    },
    {
      label: "Impact cache",
      status: impactCacheStage.status,
      summary: impactCacheStage.summary
    },
    {
      label: "Impact mapping",
      status: impactStage.status,
      summary: impactStage.summary
    },
    {
      label: "Likely impacts",
      status: likelyImpacts.length ? "success" : "neutral",
      summary: likelyImpacts.length
        ? likelyImpacts
            .slice(0, 3)
            .map((impact) => `${impact.asset} (${impact.impactDirection}, ${impact.directness})`)
            .join(", ")
        : "No likely impacted stocks were ranked for this input."
    }
  ];
}

function renderTestTraceGrid(testRun) {
  const stages = buildTestTraceItems(testRun);

  return `
    <div class="test-stage-grid">
      ${stages
        .map(
          (stage) => `
            <article class="test-stage test-stage-${stage.status}">
              <div class="test-stage-head">
                <strong>${escapeHtml(stage.label)}</strong>
                <span class="pill pill-muted">${escapeHtml(formatEnumLabel(stage.status))}</span>
              </div>
              <p>${escapeHtml(stage.summary)}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTestOutputCard(testRun) {
  const selectedNormalized =
    testRun?.selectedNormalized || testRun?.liveNormalized || testRun?.cachedNormalized || testRun?.heuristicBaseline || null;

  if (!selectedNormalized) {
    return `
      <article class="status-inline">
        <strong>No analysis result yet</strong>
        <p>Run the test to see normalized output, mapped assets, and likely impacts.</p>
      </article>
    `;
  }

  return `
    <article class="operator-card">
      <div class="operator-card-head">
        <div>
          <strong>${escapeHtml(testRun?.source?.handle || testRun?.rawPost?.sourceId || "@testbench")}</strong>
          <span>${escapeHtml(testRun?.rawPost?.createdAt || testRun?.generatedAt || "")}</span>
        </div>
        <span class="pill">${escapeHtml(selectedNormalized.clusterId || "pending")}</span>
      </div>
      <p>${escapeHtml(testRun?.rawPost?.body || "")}</p>
      <div class="tag-row">
        <span class="tag">${escapeHtml(selectedNormalized.claimType || "Pending")}</span>
        <span class="tag">${escapeHtml(selectedNormalized.direction || "Pending")}</span>
        <span class="tag">${selectedNormalized.actionable ? "Actionable" : "Filtered down"}</span>
        ${renderPostVerificationTag(selectedNormalized)}
        <span class="tag">${formatPercent(selectedNormalized.confidence || 0)}</span>
      </div>
      ${renderPostVerificationNote(selectedNormalized)}
      <div class="tweet-analysis">
        <div class="tweet-analysis-block">
          <span>Mapped assets</span>
          ${renderMappedAssetStack(selectedNormalized)}
        </div>
        <div class="tweet-analysis-block">
          <span>Likely impacted stocks</span>
          ${renderLikelyImpactSummary(selectedNormalized)}
        </div>
      </div>
    </article>
  `;
}

function renderTestsPage() {
  const extractor = getEngine().extractor || EMPTY_DATA.engine.extractor;
  const draft = state.testDraft || DEFAULT_TEST_DRAFT;
  const testRun = state.testRunData;
  const sourceOptions = getData().sources || [];

  return `
    <main class="office-content">
      ${renderStatusBanner()}
      ${renderOperatorNotice()}
      <section class="office-panel office-summary-panel">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Tests</span>
            <h2>Single-tweet lab with full analysis trace</h2>
            <p class="section-copy">Paste one tweet or note, run an ad hoc analysis, and inspect the chain from request envelope through normalized output without polluting the live feed.</p>
          </div>
          <div class="office-inline-meta">
            <span>${escapeHtml(extractor.activeMode || "heuristic")}</span>
            <span>${escapeHtml(extractor.model || "No hosted model")}</span>
          </div>
        </div>
        <div class="office-summary-grid">
          <article class="office-metric">
            <span>Extractor mode</span>
            <strong>${escapeHtml(formatEnumLabel(extractor.activeMode || "heuristic"))}</strong>
            <small>${escapeHtml(extractor.provider || "local rules")}</small>
          </article>
          <article class="office-metric">
            <span>Model</span>
            <strong>${escapeHtml(extractor.model || "Heuristic only")}</strong>
            <small>${escapeHtml(extractor.promptVersion || "No prompt bundle")}</small>
          </article>
          <article class="office-metric">
            <span>Last test</span>
            <strong>${testRun?.source?.handle ? escapeHtml(testRun.source.handle) : "Pending"}</strong>
            <small>${testRun?.generatedAt ? formatGeneratedAt(testRun.generatedAt) : "Run the first ad hoc test"}</small>
          </article>
          <article class="office-metric">
            <span>Impact mapper</span>
            <strong>${
              testRun?.impactReplay?.liveRun
                ? testRun.impactReplay.liveRun.ok
                  ? "Completed"
                  : "Failed"
                : testRun?.impactReplay?.validationReady?.liveEligible
                  ? "Available"
                  : "Off"
            }</strong>
            <small>${
              testRun?.impactReplay?.cache?.hit
                ? "Cached ranking available"
                : testRun?.impactReplay?.config?.model
                  ? `${testRun.impactReplay.config.model} · ${testRun.impactReplay.validationReady?.candidateCount || 0} candidates`
                  : "No hosted impact mapper configured"
            }</small>
          </article>
          <article class="office-metric">
            <span>Impact cache</span>
            <strong>${testRun?.impactReplay?.cache?.hit ? "Hit" : "Miss"}</strong>
            <small>${
              testRun?.impactReplay?.cache?.entry?.cachedAt
                ? formatGeneratedAt(testRun.impactReplay.cache.entry.cachedAt)
                : testRun?.impactReplay?.config?.model
                  ? "No cached ranking yet"
                  : "No hosted impact mapper configured"
            }</small>
          </article>
        </div>
      </section>
      <section class="section-card">
        <div class="section-header">
          <div>
            <span class="eyebrow">Ad hoc test</span>
            <h3>Paste one tweet and inspect the chain</h3>
          </div>
          <div class="office-form-actions">
            <button class="mini-chip" type="button" data-rerun-test-live ${extractor.activeMode === "openai" && !state.isTestRunLoading ? "" : "disabled"}>Re-run live extraction</button>
            <button class="mini-chip" data-view="signals">Open Feed</button>
          </div>
        </div>
        <div class="replay-shell test-shell">
          <section class="office-panel">
            <form class="operator-form office-form" data-test-drive-form>
              <input type="hidden" name="testSourceId" value="${escapeHtml(draft.sourceId || "")}" />
              <div class="field-grid">
                <label class="form-field">
                  <span>Source handle</span>
                  <input name="testSourceHandle" list="test-source-handle-list" value="${escapeHtml(draft.sourceHandle || "@testbench")}" />
                  <small class="subtle">If this matches an existing monitored source, its metadata is reused automatically.</small>
                </label>
                <label class="form-field">
                  <span>Source name</span>
                  <input name="testSourceName" value="${escapeHtml(draft.sourceName || "")}" />
                </label>
                <label class="form-field">
                  <span>Category</span>
                  <input name="testSourceCategory" value="${escapeHtml(draft.sourceCategory || "")}" />
                </label>
                <label class="form-field">
                  <span>Allowed assets override</span>
                  <input name="testAllowedAssets" placeholder="NVDA, AMD, IBM" value="${escapeHtml(draft.allowedAssets || "")}" />
                </label>
              </div>
              <label class="form-field">
                <span>Relevant sectors override</span>
                <input name="testRelevantSectors" placeholder="AI, semis, public sector, software" value="${escapeHtml(draft.relevantSectors || "")}" />
              </label>
              <label class="form-field">
                <span>Tweet or note</span>
                <textarea
                  name="testRawText"
                  rows="10"
                  placeholder="US government AI procurement talk is moving faster than expected. If this turns into real operating language, which names should I watch?"
                >${escapeHtml(draft.rawText || "")}</textarea>
              </label>
              <label class="checkbox-field">
                <input type="checkbox" name="testRunLive" ${draft.runLive ? "checked" : ""} />
                <span>Run live model extraction when available</span>
              </label>
              <div class="office-form-actions">
                <button class="refresh-button" type="submit" ${state.isTestRunLoading ? "disabled" : ""}>
                  ${state.isTestRunLoading ? "Analyzing..." : "Run analysis"}
                </button>
                <button class="mini-chip" type="button" data-view="dashboard">Back to Today</button>
              </div>
              <datalist id="test-source-handle-list">
                ${sourceOptions.map((source) => `<option value="${escapeHtml(source.handle)}">${escapeHtml(source.name || source.handle)}</option>`).join("")}
              </datalist>
            </form>
          </section>
          <section class="office-panel replay-panel">
            ${
              state.testRunError
                ? `
                  <article class="status-inline status-inline-error">
                    <strong>Test error</strong>
                    <p>${escapeHtml(state.testRunError)}</p>
                  </article>
                `
                : ""
            }
            ${
              state.isTestRunLoading
                ? `
                  <article class="status-inline">
                    <strong>Running ad hoc analysis</strong>
                    <p>The lab is building the extractor request, checking cache, and normalizing the single-post output now.</p>
                  </article>
                `
                : ""
            }
            ${testRun ? renderTestTraceGrid(testRun) : ""}
            ${renderTestOutputCard(testRun)}
            ${
              testRun
                ? `
                  <details open>
                    <summary>Selected normalized output</summary>
                    ${renderJsonBlock(testRun.selectedNormalized)}
                  </details>
                  <details>
                    <summary>Heuristic baseline</summary>
                    ${renderJsonBlock(testRun.heuristicBaseline)}
                  </details>
                  <details>
                    <summary>Prompt guide and validation focus</summary>
                    ${renderJsonBlock(testRun.replay.promptGuide)}
                  </details>
                  <details>
                    <summary>Extraction request envelope</summary>
                    ${renderJsonBlock(testRun.replay.requestEnvelope)}
                  </details>
                  <details>
                    <summary>Cached extraction payload</summary>
                    ${
                      testRun.replay.cache.hit
                        ? renderJsonBlock(testRun.replay.cache.entry)
                        : '<article class="status-inline"><strong>No cached extraction</strong><p>This exact input has not been cached for the current prompt/model fingerprint yet.</p></article>'
                    }
                  </details>
                  <details>
                    <summary>Cached normalized output</summary>
                    ${
                      testRun.cachedNormalized
                        ? renderJsonBlock(testRun.cachedNormalized)
                        : '<article class="status-inline"><strong>No cached normalized output</strong><p>The cache did not contain a model extraction for this test case.</p></article>'
                    }
                  </details>
                  <details>
                    <summary>One-off live run</summary>
                    ${
                      testRun.replay.liveRun
                        ? renderJsonBlock(testRun.replay.liveRun)
                        : `<article class="status-inline"><strong>Live run not executed</strong><p>${testRun.replay.validationReady?.liveEligible ? "Enable the checkbox or use Re-run live extraction to force a one-off model call." : "The current extractor is not in hosted-model mode."}</p></article>`
                    }
                  </details>
                  <details>
                    <summary>Live normalized output</summary>
                    ${
                      testRun.liveNormalized
                        ? renderJsonBlock(testRun.liveNormalized)
                        : '<article class="status-inline"><strong>No live normalized output</strong><p>The selected output came from cache or heuristic normalization for this run.</p></article>'
                    }
                  </details>
                  <details>
                    <summary>Impact-mapping prompt guide</summary>
                    ${renderJsonBlock(testRun.impactReplay.promptGuide)}
                  </details>
                  <details>
                    <summary>Impact-mapping request envelope</summary>
                    ${renderJsonBlock(testRun.impactReplay.requestEnvelope)}
                  </details>
                  <details>
                    <summary>Impact-mapping cache entry</summary>
                    ${
                      testRun.impactReplay.cache?.hit
                        ? renderJsonBlock(testRun.impactReplay.cache.entry)
                        : '<article class="status-inline"><strong>No cached impact ranking</strong><p>This normalized post and watched-universe context have not been cached for the current model prompt yet.</p></article>'
                    }
                  </details>
                  <details>
                    <summary>Impact-mapping live run</summary>
                    ${
                      testRun.impactReplay.liveRun
                        ? renderJsonBlock(testRun.impactReplay.liveRun)
                        : `<article class="status-inline"><strong>No live impact-mapping run</strong><p>${testRun.impactReplay.validationReady?.liveEligible ? "Enable the checkbox or rerun the analysis to force a live impact-mapping call." : "The current impact mapper is not in hosted-model mode."}</p></article>`
                    }
                  </details>
                `
                : `
                  <article class="status-inline">
                    <strong>Paste one tweet to start</strong>
                    <p>This lab keeps the analysis separate from the live feed while showing the same extraction and normalization path the app would use downstream.</p>
                  </article>
                `
            }
          </section>
        </div>
      </section>
    </main>
  `;
}

function renderDocsPage() {
  return `
    <main class="content-shell">
      ${renderStatusBanner()}
      <section class="hero-panel docs-hero">
        <div>
          <span class="eyebrow">Docs</span>
          <h2>Decision framework and operator guardrails</h2>
          <p>
            This page collects the framework that used to sit on the landing page, so the dashboard can stay focused on live signals while the logic stays documented in one place.
          </p>
        </div>
        <div class="hero-decision">
          <span class="pill pill-muted">Framework docs</span>
          <strong>Posts -> claims -> clusters -> policy -> decision</strong>
          <p>The product is intentionally built to avoid a tweet-to-LLM-to-trade shortcut.</p>
        </div>
      </section>
      ${renderPipeline()}
      <section class="section-card">
        <div class="section-header">
          <div>
            <span class="eyebrow">Design principles</span>
            <h3>What the system optimizes for</h3>
          </div>
          <p class="section-copy">These principles keep the product explainable, narrow, and easier to trust as it evolves.</p>
        </div>
        <div class="decision-grid">
          ${docsPrinciples
            .map(
              (item) => `
              <article class="decision-card">
                <h4>${item.title}</h4>
                <p>${item.body}</p>
              </article>
            `
            )
            .join("")}
        </div>
      </section>
      <section class="section-card">
        <div class="section-header">
          <div>
            <span class="eyebrow">Hard checks</span>
            <h3>What gets evaluated before a call reaches the book</h3>
          </div>
          <p class="section-copy">These checks come before action selection so weak or stale narratives get blocked early.</p>
        </div>
        <div class="docs-checks">
          ${docsHardChecks
            .map(
              (item, index) => `
              <article class="pipeline-card">
                <span class="pipeline-index">0${index + 1}</span>
                <p>${item}</p>
              </article>
            `
            )
            .join("")}
        </div>
      </section>
    </main>
  `;
}

function renderDecisionCards() {
  const filteredDecisions = getFilteredDecisions();

  return `
    <section class="section-card">
      <div class="section-header">
        <div>
          <span class="eyebrow">Latest decisions</span>
          <h3>Directional calls with explicit why-not logic</h3>
        </div>
        <p class="section-copy">Each card exposes rationale, uncertainty, and the reason alternative actions were rejected.</p>
      </div>
      <div class="toolbar-row">
        <div class="filter-row">
          ${actionFilters
            .map(
              (filter) => `
              <button class="filter-chip ${state.actionFilter === filter ? "is-active" : ""}" data-action-filter="${filter}">
                ${filter}
              </button>
            `
            )
            .join("")}
        </div>
        <span class="subtle">${filteredDecisions.length} visible recommendations</span>
      </div>
      <div class="decision-grid">
        ${
          filteredDecisions.length
            ? filteredDecisions
                .map(
                  (decision) => `
                  <article class="decision-card">
                    <div class="decision-topline">
                      <button class="asset-link" data-asset="${decision.asset}">${decision.asset}</button>
                      <span class="decision-badge decision-${decision.action.toLowerCase()}">${decision.action}</span>
                    </div>
                    <div class="decision-meta">
                      <span>${decision.horizon}</span>
                      <span>${formatPercent(decision.confidence)}</span>
                    </div>
                    ${renderDecisionMathSummary(getDecisionMath(decision))}
                    <p>${decision.rationale[0]}</p>
                    <details>
                      <summary>Full reasoning trace</summary>
                      <div class="details-stack">
                        <div>
                          <strong>Why this action</strong>
                          <ul>${decision.rationale.map((item) => `<li>${item}</li>`).join("")}</ul>
                        </div>
                        <div>
                          <strong>Why not something else</strong>
                          <ul>${decision.whyNot.map((item) => `<li>${item}</li>`).join("")}</ul>
                        </div>
                        <div>
                          <strong>Uncertainty</strong>
                          <ul>${decision.uncertainty.map((item) => `<li>${item}</li>`).join("")}</ul>
                        </div>
                      </div>
                    </details>
                  </article>
                `
                )
                .join("")
            : `
              <article class="decision-card empty-inline-card">
                <h4>No ${state.actionFilter} recommendations right now.</h4>
                <p>The filter is working; this snapshot just does not currently surface that action class.</p>
              </article>
            `
        }
      </div>
    </section>
  `;
}

function renderClusterBoard() {
  const { clusters } = getData();

  return `
    <section class="section-card">
      <div class="section-header">
        <div>
          <span class="eyebrow">Event clustering</span>
          <h3>Repeated aligned posts become higher-level narratives</h3>
        </div>
        <p class="section-copy">This is the core v1 product behavior: events matter more than single tweets.</p>
      </div>
      <div class="cluster-grid">
        ${clusters
          .map(
            (cluster) => `
            <article class="cluster-card">
              <div class="cluster-meta">
                <span class="pill">${cluster.policyOutcome}</span>
                <span>${cluster.timeWindow}</span>
              </div>
              <h4>${cluster.title}</h4>
              <p>${cluster.summary}</p>
              <div class="metric-row">
                <span>Agreement</span>
                <strong>${formatPercent(cluster.agreementScore)}</strong>
              </div>
              <div class="metric-row">
                <span>Novelty</span>
                <strong>${cluster.novelty}</strong>
              </div>
              <div class="chip-row">
                ${cluster.mappedAssets.map((asset) => `<button class="mini-chip" data-asset="${asset}">${asset}</button>`).join("")}
              </div>
              <details>
                <summary>Source evidence</summary>
                <ul>
                  ${getPostsForCluster(cluster.id)
                    .map((post) => {
                      const source = getSource(post.sourceId);
                      return `<li><button class="inline-link" data-source="${source?.id || ""}">${source?.handle || "Unknown source"}</button>: ${post.body}</li>`;
                    })
                    .join("")}
                </ul>
              </details>
            </article>
          `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderSignalFeed() {
  const { posts, vetoedSignals } = getData();
  const recentPosts = sortPostsByCreatedAt(posts).slice(0, 12);

  return `
    <section class="section-card split-card">
      <div>
        <div class="section-header">
          <div>
            <span class="eyebrow">Raw monitoring</span>
            <h3>Recent monitored posts</h3>
          </div>
        </div>
        <div class="feed-list">
          ${recentPosts
            .map((post) => {
              const source = getSource(post.sourceId);
              return `
                <article class="feed-item">
                  <div class="feed-head">
                    <button class="inline-link" data-source="${source?.id || ""}">${source?.handle || "Unknown source"}</button>
                    <span>${post.timestamp}</span>
                  </div>
                  <p>${post.body}</p>
                  <div class="tag-row">
                    <span class="tag">${post.claimType}</span>
                    <span class="tag">${post.actionable ? "Actionable" : "Not actionable"}</span>
                    ${renderPostVerificationTag(post)}
                    ${renderMappedAssetButtons(post, "tag tag-button")}
                    ${renderAssetMappingStatusTag(post)}
                  </div>
                  ${renderPostVerificationNote(post)}
                  ${renderPostVerificationControls(post)}
                  ${renderAssetMappingNote(post)}
                  ${renderLikelyImpactSummary(post)}
                </article>
              `;
            })
            .join("")}
        </div>
      </div>
      <div>
        <div class="section-header">
          <div>
            <span class="eyebrow">Veto layer</span>
            <h3>Signals blocked before they reached the book</h3>
          </div>
        </div>
        <div class="veto-list">
          ${vetoedSignals
            .map(
              (item) => `
              <article class="veto-card">
                <div class="decision-topline">
                  <strong>${item.asset}</strong>
                  <span class="pill pill-muted">${item.status}</span>
                </div>
                <p>${item.reason}</p>
                <span class="subtle">${item.candidateAction} -> ${item.finalAction}</span>
              </article>
            `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderAnalysedTweetsWindow() {
  const recentPosts = getRecentAnalysedPosts();
  const status = getStoreStatus();

  return `
    <section class="section-card">
      <div class="section-header">
        <div>
          <span class="eyebrow">Analysed tweets</span>
          <h3>Scrollable X feed from the last 3 days</h3>
        </div>
        <p class="section-copy">Each item shows the tweet plus the interpretation layers that feed clustering and decisions. Feed mode: ${status.mode || "fake-api"}.</p>
      </div>
      <div class="tweet-window">
        <div class="tweet-scroll">
          ${
            recentPosts.length
              ? recentPosts
                  .map((post) => {
                    const source = getSource(post.sourceId);
                    const cluster = getCluster(post.clusterId);

                    return `
                      <article class="tweet-card">
                        <div class="tweet-head">
                          <div>
                            <button class="inline-link" data-source="${source?.id || ""}">${source?.handle || "Unknown source"}</button>
                            <p class="tweet-source-meta">${source?.category || "Unknown category"}</p>
                          </div>
                          <span class="tweet-time">${post.timestamp}</span>
                        </div>
                        <p class="tweet-body">${post.body}</p>
                        <div class="tag-row">
                          <span class="tag">${post.claimType}</span>
                          <span class="tag">${post.direction}</span>
                          <span class="tag">${post.actionable ? "Actionable" : "Filtered down"}</span>
                          ${renderPostVerificationTag(post)}
                          <span class="tag">${formatPercent(post.confidence)}</span>
                        </div>
                        ${renderPostVerificationNote(post)}
                        ${renderPostVerificationControls(post)}
                        <div class="tweet-analysis">
                          <div class="tweet-analysis-block">
                            <span>Cluster</span>
                            <strong>${cluster?.title || "Awaiting clustering"}</strong>
                          </div>
                          <div class="tweet-analysis-block">
                            <span>Mapped assets</span>
                            ${renderMappedAssetStack(post)}
                          </div>
                          <div class="tweet-analysis-block">
                            <span>Likely impacted stocks</span>
                            ${renderLikelyImpactSummary(post)}
                          </div>
                        </div>
                      </article>
                    `;
                  })
                  .join("")
              : `
                <article class="tweet-card tweet-card-empty">
                  <h4>No analysed tweets in the last 3 days.</h4>
                  <p>The scroll window is live, but the current snapshot does not contain any posts inside the active three-day window.</p>
                </article>
              `
          }
        </div>
      </div>
    </section>
  `;
}

function renderDashboard() {
  const profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile;
  const setupState = buildSingleUserSetupState(profile);
  const latestAnswer = getLatestAdvisorAnswer();
  const feedMode = getFeedMode();
  const trackedTickers = getTrackedAssetTickers(profile);
  const cashSummary = buildProfileCashSummary(profile);
  const { trackedAssets, actionableAssets, urgentAssets } = buildTrackedPortfolioAnalytics(profile);
  const recentSignals = sortPostsByCreatedAt(
    (trackedTickers.length
      ? getData().posts.filter((post) =>
          getPostExposureTickers(post, profile).some((asset) => trackedTickers.includes(asset))
        )
      : getData().posts
    ).slice(0, 3)
  );
  const reviewSummary = getReviewSummary();
  const researchSummary = getResearchSummary();
  const researchDossiers = getResearchDossiers();
  const featuredResearch = researchDossiers.find(
    (dossier) => normalizeResearchStatus(dossier?.status || dossier?.stage) === "candidate"
  ) || researchDossiers[0] || null;
  const reviewQueue = getDecisionReviewQueue().slice(0, 4);
  const nextReviewItem = reviewQueue.find((item) => item.reviewStatus === "proposed") || null;
  const nextAction =
    !setupState.hasDecisionFrame || !setupState.hasPortfolioContext
      ? "Finish the essentials in Portfolio so the brief can become personal."
      : reviewSummary.proposedCount
        ? `Approve or dismiss ${nextReviewItem?.asset || "the next queued call"} in Decisions.`
        : !setupState.hasRealSignalInput
          ? "Bring in a few real posts in Feed before trusting the brief."
          : featuredResearch && !isResearchApproved(featuredResearch)
            ? `Move ${escapeHtml(getResearchDossierHeadline(featuredResearch, "the lead thesis"))} forward in Decisions.`
            : urgentAssets.length
              ? `Review ${urgentAssets[0]?.ticker || "the highest-priority asset"} first.`
              : "You’re ready for the daily loop: Feed, Decisions, then Advisor.";
  const attentionItems = [];

  if (!setupState.hasDecisionFrame || !setupState.hasPortfolioContext) {
    attentionItems.push({
      title: "Finish portfolio essentials",
      body: "Add your watchlist and at least a little ownership context so the brief ranks the right names.",
      actionView: "setup",
      actionLabel: "Open Portfolio"
    });
  }

  if (!setupState.hasRealSignalInput) {
    attentionItems.push({
      title: "Switch from demo data to real posts",
      body:
        feedMode === "fake"
          ? "The app is still on the seeded demo feed. Import a few real posts to make it useful."
          : "Bring in a few real posts so today’s brief reflects your actual signal flow.",
      actionView: "signals",
      actionLabel: "Open Feed"
    });
  }

  reviewQueue.forEach((item) => {
    attentionItems.push({
      title: `${item.asset} ${item.action} is waiting`,
      body: item.summary || "This candidate decision is waiting for an operator decision.",
      actionView: "decisions",
      actionLabel: "Open Decisions"
    });
  });

  if (!reviewQueue.length && featuredResearch) {
    attentionItems.push({
      title: "Advance the lead research packet",
      body: featuredResearch.summary || featuredResearch.thesis || "The lead thesis still needs validation or approval.",
      actionView: "decisions",
      actionLabel: "Review research"
    });
  }

  return `
    <main class="office-content">
      ${renderStatusBanner()}
      ${renderOperatorNotice()}
      <section class="office-panel today-hero-panel">
        <div class="today-hero-grid">
          <div class="today-hero-copy">
            <span class="eyebrow">Today</span>
            <h2>${reviewSummary.proposedCount ? "Start with the queue" : trackedAssets.length ? "Your daily brief is ready" : "Set up the desk in a few minutes"}</h2>
            <p>${nextAction}</p>
            <div class="office-form-actions">
              <button class="refresh-button" type="button" data-view="${reviewSummary.proposedCount ? "decisions" : !setupState.hasDecisionFrame || !setupState.hasPortfolioContext ? "setup" : "signals"}">
                ${reviewSummary.proposedCount ? "Open Decisions" : !setupState.hasDecisionFrame || !setupState.hasPortfolioContext ? "Open Portfolio" : "Open Feed"}
              </button>
              <button class="mini-chip" type="button" data-view="advisor">Ask Advisor</button>
            </div>
          </div>
          <div class="today-hero-stats">
            <article class="today-stat-card">
              <span>Pending approvals</span>
              <strong>${reviewSummary.proposedCount}</strong>
              <small>${reviewSummary.reviewedCount} reviewed so far</small>
            </article>
            <article class="today-stat-card">
              <span>Tracked assets</span>
              <strong>${trackedAssets.length}</strong>
              <small>${profile.holdings.length} holdings and ${(profile.watchlist || []).length} watchlist names</small>
            </article>
            <article class="today-stat-card">
              <span>Feed</span>
              <strong>${formatEnumLabel(feedMode)}</strong>
              <small>${getRecentAnalysedPosts().length} recent analysed posts</small>
            </article>
            <article class="today-stat-card">
              <span>Safety buffer</span>
              <strong>${cashSummary.emergencyCoverageMonths ? `${cashSummary.emergencyCoverageMonths}m` : "Pending"}</strong>
              <small>${cashSummary.monthlyBurn > 0 ? `${formatCurrency(cashSummary.monthlyBurn)} burn gap` : "Cash flow okay"}</small>
            </article>
          </div>
        </div>
      </section>
      <section class="office-panel">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Next up</span>
            <h3>What needs your attention</h3>
          </div>
          <button class="mini-chip" data-view="decisions">Open Decisions</button>
        </div>
        <div class="office-checklist today-checklist">
          ${attentionItems.length
            ? attentionItems
                .slice(0, 4)
                .map(
                  (item) => `
                    <div class="office-checklist-row">
                      <strong>${escapeHtml(item.title)}</strong>
                      <span>Do next</span>
                      <p>${escapeHtml(item.body)}</p>
                      <div class="office-form-actions">
                        <button class="mini-chip" type="button" data-view="${item.actionView}">${item.actionLabel}</button>
                      </div>
                    </div>
                  `
                )
                .join("")
            : `
              <div class="office-checklist-row is-complete">
                <strong>No urgent blockers</strong>
                <span>Clear</span>
                <p>The setup, feed, and queue are all in a usable state right now.</p>
              </div>
            `}
        </div>
      </section>
      <section class="office-grid office-grid-two">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Queue</span>
              <h3>Decisions waiting for you</h3>
            </div>
            <button class="mini-chip" data-view="decisions">Open Decisions</button>
          </div>
          <div class="feed-list">
            ${
              reviewQueue.length
                ? reviewQueue
                    .map(
                      (item) => `
                        <article class="feed-item">
                          <div class="feed-head">
                            <strong>${item.asset} ${item.action}</strong>
                            ${renderDecisionReviewTag(item.reviewStatus)}
                          </div>
                          <p>${escapeHtml(item.summary || "No rationale captured.")}</p>
                          <div class="chip-row">
                            <span class="tag">${formatPercent(item.confidence || 0)}</span>
                            <span class="tag">${item.relatedPostCount || 0} posts</span>
                          </div>
                        </article>
                      `
                    )
                    .join("")
                : `<article class="status-inline"><strong>No queue items right now</strong><p>As research and signals mature, candidate decisions will appear here.</p></article>`
            }
          </div>
        </section>
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Feed</span>
              <h3>Latest posts worth reading</h3>
            </div>
            <button class="mini-chip" data-view="signals">Open Feed</button>
          </div>
          <div class="feed-list">
            ${
              recentSignals.length
                ? recentSignals
                    .map((post) => {
                      const source = getSource(post.sourceId);

                      return `
                        <article class="feed-item">
                          <div class="feed-head">
                            <strong>${source?.handle || post.sourceId}</strong>
                            <span>${formatGeneratedAt(post.createdAt)}</span>
                          </div>
                          <p>${escapeHtml(post.body)}</p>
                          <div class="tag-row">
                            <span class="tag">${escapeHtml(post.claimType || "Unknown")}</span>
                            ${renderMappedAssetButtons(post)}
                          </div>
                          ${renderLikelyImpactInline(post)}
                        </article>
                      `;
                    })
                    .join("")
                : `<article class="status-inline"><strong>No live posts yet</strong><p>Use Feed to import a few real posts and the brief will become much more useful.</p></article>`
            }
          </div>
        </section>
      </section>
      <section class="office-grid office-grid-two">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Research</span>
              <h3>Lead thesis in motion</h3>
            </div>
            <button class="mini-chip" data-view="decisions">Open Decisions</button>
          </div>
          ${
            featuredResearch
              ? `
                <article class="research-linked-card">
                  <div class="decision-topline">
                    <strong>${escapeHtml(getResearchDossierHeadline(featuredResearch))}</strong>
                    ${renderLifecyclePill(featuredResearch.status || featuredResearch.stage)}
                  </div>
                  <p>${escapeHtml(featuredResearch.thesis || featuredResearch.summary || "No thesis summary provided yet.")}</p>
                  <div class="chip-row">
                    <span class="tag">${researchSummary.dossierCount || researchDossiers.length} dossiers</span>
                    <span class="tag">${researchSummary.approvedCount || 0} approved</span>
                  </div>
                </article>
              `
              : `<article class="status-inline"><strong>No research dossiers yet</strong><p>Capture your first thesis in Decisions before promoting ideas into the queue.</p></article>`
          }
        </section>
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Advisor</span>
              <h3>${latestAnswer ? latestAnswer.answer.headline : "Portfolio-aware guidance is ready when you are"}</h3>
            </div>
            <button class="mini-chip" data-view="advisor">Open advisor</button>
          </div>
          ${
            latestAnswer
              ? `
                <p>${latestAnswer.answer.answer}</p>
                <div class="office-inline-meta">
                  <span>${latestAnswer.assetTicker}</span>
                  <span>${latestAnswer.answer.stance}</span>
                  <span>${formatPercent(latestAnswer.answer.confidence || 0)}</span>
                </div>
              `
              : `
                <div class="office-checklist">
                  <div class="office-checklist-row ${setupState.hasDecisionFrame ? "is-complete" : ""}">
                    <strong>Decision frame</strong>
                    <span>${setupState.hasDecisionFrame ? "Ready" : "Needs input"}</span>
                    <p>Add your watchlist, horizon, and a little investing context.</p>
                  </div>
                  <div class="office-checklist-row ${setupState.hasCashContext ? "is-complete" : ""}">
                    <strong>Cash context</strong>
                    <span>${setupState.hasCashContext ? "Ready" : "Optional but recommended"}</span>
                    <p>Income, expenses, and emergency cash help the advice stay realistic.</p>
                  </div>
                </div>
              `
          }
        </section>
      </section>
    </main>
  `;
}

function renderAssetDecision(asset, decision) {
  if (!decision) {
    const noDecisionCopy = asset.isCurated
      ? "This asset is in the curated universe, but the current snapshot did not generate a live BUY, HOLD, or SELL call."
      : asset.isTracked
        ? "This tracked asset is in your personal watched universe. It can still appear in likely-impact ranking, but it will not receive a live BUY, HOLD, or SELL call until you add explicit research coverage or promote it into the curated universe."
        : "This asset is not part of the active decision set yet.";

    return `
      <article class="section-card nested-card">
        <span class="eyebrow">Decision summary</span>
        <h3>No active recommendation for ${asset.ticker}</h3>
        <p>${noDecisionCopy}</p>
      </article>
    `;
  }

  const decisionReview = getCurrentDecisionReview(asset.ticker);
  const decisionMath = getDecisionMath(decision);
  const linkedResearch = getResearchForAsset(asset.ticker, decision);
  const researchStatus = normalizeResearchStatus(linkedResearch?.status || linkedResearch?.stage);
  const researchEligibleForReview =
    decision?.researchEligibleForReview != null
      ? Boolean(decision.researchEligibleForReview)
      : isResearchEligibleForReview(linkedResearch);
  const lifecycleLabel = decisionReview
    ? decisionReview.reviewStatus === "approved"
      ? "Approved"
      : decisionReview.reviewStatus === "dismissed"
        ? "Dismissed"
        : "Candidate"
    : "Informational";

  return `
    <article class="section-card nested-card">
      <span class="eyebrow">Decision summary</span>
      <h3>${decision.rationale[0]}</h3>
      <p>${decision.whyNot[0]}</p>
      <div class="research-lifecycle-strip">
        <div class="research-lifecycle-step is-active">
          <span>Research</span>
          <strong>${linkedResearch ? formatEnumLabel(researchStatus) : "Missing"}</strong>
        </div>
        <div class="research-lifecycle-step ${researchEligibleForReview && (decisionReview?.reviewStatus === "proposed" || !decisionReview) ? "is-active" : ""}">
          <span>Candidate</span>
          <strong>${researchEligibleForReview ? lifecycleLabel : "Blocked"}</strong>
        </div>
        <div class="research-lifecycle-step ${(decisionReview?.reviewStatus === "approved" || isResearchApproved(linkedResearch)) ? "is-active" : ""}">
          <span>Approved</span>
          <strong>${decisionReview?.reviewStatus === "approved" && isResearchApproved(linkedResearch) ? "Eligible" : "Locked"}</strong>
        </div>
      </div>
      <div class="office-review-strip">
        <div>
          <span class="eyebrow">Operator review</span>
          <div class="office-review-status">
            ${
              decisionReview && researchEligibleForReview
                ? renderDecisionReviewTag(decisionReview.reviewStatus)
                : `<span class="subtle">${researchEligibleForReview ? "No explicit review required" : "Research gating active"}</span>`
            }
            <strong>${
              !researchEligibleForReview
                ? getResearchBlockingReason(decision, linkedResearch)
                : decisionReview?.reviewedAt
                ? `Updated ${formatGeneratedAt(decisionReview.reviewedAt)}`
                : decisionReview
                  ? "Still awaiting review"
                  : "This decision is informational unless it re-enters the approval queue."
            }</strong>
          </div>
        </div>
        ${renderDecisionReviewGate(decisionReview?.id || "", decisionReview?.reviewStatus || "proposed", decision, linkedResearch)}
      </div>
      <div class="research-linked-grid">
        ${renderLinkedResearchCard(linkedResearch, decision)}
      </div>
      ${renderDecisionMathBlock(decisionMath)}
      <details open>
        <summary>Full reasoning trace</summary>
        <div class="details-stack">
          <div>
            <strong>Reasons</strong>
            <ul>${decision.rationale.map((item) => `<li>${item}</li>`).join("")}</ul>
          </div>
          <div>
            <strong>Why not</strong>
            <ul>${decision.whyNot.map((item) => `<li>${item}</li>`).join("")}</ul>
          </div>
          <div>
            <strong>Uncertainty</strong>
            <ul>${decision.uncertainty.map((item) => `<li>${item}</li>`).join("")}</ul>
          </div>
        </div>
      </details>
    </article>
  `;
}

function renderDecisionsPage() {
  const profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile;
  const reviewQueue = getDecisionReviewQueue();
  const reviewSummary = getReviewSummary();
  const dossiers = getResearchDossiers();
  const researchSummary = getResearchSummary();
  const watchedUniverse = getWatchedUniverse(profile);
  const { priorityAssets } = buildTrackedPortfolioAnalytics(profile);
  const researchCandidates = dossiers.filter((dossier) => {
    const status = normalizeResearchStatus(dossier?.status || dossier?.stage);
    return ["candidate", "validated", "approved"].includes(status);
  });
  const visibleQueue = reviewQueue.slice(0, 6);
  const visibleDossiers = (researchCandidates.length ? researchCandidates : dossiers).slice(0, 6);
  const visibleAssets = (
    priorityAssets.length
      ? priorityAssets.map((item) => ({
          ticker: item.ticker,
          asset: item.asset || watchedUniverse.find((entry) => entry.ticker === item.ticker) || null,
          decision: item.decision || getDecisionByAsset(item.ticker) || null,
          relatedPosts: item.relatedPosts || []
        }))
      : getData().decisions.slice(0, 6).map((decision) => ({
          ticker: decision.asset,
          asset: watchedUniverse.find((entry) => entry.ticker === decision.asset) || null,
          decision,
          relatedPosts: sortPostsByCreatedAt(
            getData().posts.filter((post) => getPostExposureTickers(post, profile).includes(decision.asset))
          ).slice(0, 2)
        }))
  ).slice(0, 6);

  return `
    <main class="office-content">
      ${renderStatusBanner()}
      ${renderOperatorNotice()}
      <section class="office-panel decisions-hero-panel">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Decisions</span>
            <h2>One place for research, queue review, and asset follow-up</h2>
            <p class="section-copy">Use this page as the core operating surface once posts start flowing. Research feeds the queue, and the queue feeds advice.</p>
          </div>
          <div class="office-form-actions">
            <button class="mini-chip" data-view="signals">Open Feed</button>
            <button class="mini-chip" data-view="advisor">Open Advisor</button>
          </div>
        </div>
        <div class="office-summary-grid">
          <article class="office-metric">
            <span>Pending approvals</span>
            <strong>${reviewSummary.proposedCount || 0}</strong>
            <small>${reviewSummary.reviewedCount || 0} reviewed</small>
          </article>
          <article class="office-metric">
            <span>Research packets</span>
            <strong>${researchSummary.dossierCount || dossiers.length || 0}</strong>
            <small>${researchSummary.approvedCount || 0} approved</small>
          </article>
          <article class="office-metric">
            <span>Watched assets</span>
            <strong>${watchedUniverse.length}</strong>
            <small>${getData().decisions.length} active decisions</small>
          </article>
          <article class="office-metric">
            <span>Recent signals</span>
            <strong>${getRecentAnalysedPosts().length}</strong>
            <small>Live posts informing the current snapshot</small>
          </article>
        </div>
      </section>
      <section class="office-grid office-grid-two">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Approval queue</span>
              <h3>Decide what moves forward</h3>
            </div>
            ${
              state.developerMode
                ? `<button class="mini-chip" data-view="admin">Operations</button>`
                : ""
            }
          </div>
          ${
            visibleQueue.length
              ? `
                <table class="office-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Action</th>
                      <th>Confidence</th>
                      <th>Research</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${visibleQueue
                      .map(
                        (item) => `
                          <tr>
                            <td><button class="inline-link" data-asset="${item.asset}">${item.asset}</button></td>
                            <td>${item.action}</td>
                            <td>${formatPercent(item.confidence || 0)}</td>
                            <td>${
                              item.linkedResearch
                                ? `${escapeHtml(getResearchDossierHeadline(item.linkedResearch))} ${renderLifecyclePill(item.linkedResearch.status || item.linkedResearch.stage)}`
                                : '<span class="subtle">Research missing</span>'
                            }</td>
                            <td>${renderDecisionReviewGate(item.id, item.reviewStatus, item, item.linkedResearch)}</td>
                          </tr>
                        `
                      )
                      .join("")}
                  </tbody>
                </table>
              `
              : `<article class="status-inline"><strong>No pending approvals</strong><p>When a validated thesis produces a candidate call, it will show up here first.</p></article>`
          }
        </section>
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Research</span>
              <h3>Theses moving toward approval</h3>
            </div>
            <div class="office-form-actions">
              <button class="mini-chip" data-view="research">Open research workspace</button>
            </div>
          </div>
          <div class="research-dossier-grid compact-grid">
            ${
              visibleDossiers.length
                ? visibleDossiers
                    .map(
                      (dossier) => `
                        <article class="research-linked-card">
                          <div class="decision-topline">
                            <strong>${escapeHtml(getResearchDossierHeadline(dossier))}</strong>
                            ${renderLifecyclePill(dossier.status || dossier.stage)}
                          </div>
                          <p>${escapeHtml(dossier.summary || dossier.thesis || "No summary provided.")}</p>
                          <div class="chip-row">
                            ${getResearchDossierAssets(dossier)
                              .slice(0, 4)
                              .map((asset) => `<button class="mini-chip" data-asset="${asset}">${asset}</button>`)
                              .join("")}
                          </div>
                        </article>
                      `
                    )
                    .join("")
                : `<article class="status-inline"><strong>No active research packets</strong><p>Capture a dossier from the research workspace to start the approval loop.</p></article>`
            }
          </div>
        </section>
      </section>
      <section class="office-panel">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Asset follow-up</span>
            <h3>Names the desk is currently watching</h3>
          </div>
          <div class="office-form-actions">
            <button class="mini-chip" data-view="setup">Open Portfolio</button>
          </div>
        </div>
        <div class="research-dossier-grid compact-grid">
          ${
            visibleAssets.length
              ? visibleAssets
                  .map(({ ticker, asset, decision, relatedPosts }) => `
                    <article class="research-linked-card">
                      <div class="decision-topline">
                        <strong>${ticker}</strong>
                        <span class="decision-badge decision-${(decision?.action || "hold").toLowerCase()}">${decision?.action || "WATCH"}</span>
                      </div>
                      <p>${escapeHtml(decision?.rationale?.[0] || asset?.thesis || "Tracked, but no live decision rationale is available yet.")}</p>
                      <div class="chip-row">
                        <span class="tag">${decision ? formatPercent(decision.confidence || 0) : "Pending"}</span>
                        <span class="tag">${relatedPosts.length} related posts</span>
                        <button class="mini-chip" data-asset="${ticker}">Open detail</button>
                      </div>
                      ${decision ? renderDecisionMathSummary(getDecisionMath(decision)) : ""}
                    </article>
                  `)
                  .join("")
              : `<article class="status-inline"><strong>No watched assets yet</strong><p>Add a watchlist or holdings in Portfolio and the desk will center on those names.</p></article>`
          }
        </div>
      </section>
    </main>
  `;
}

function renderResearchView() {
  const dossiers = getResearchDossiers();
  const summary = getResearchSummary();
  const scorecards = getResearchScorecards();
  const lifecycleCounts = getResearchLifecycleCounts(dossiers);
  const featuredDossier = dossiers.find((dossier) => normalizeResearchStatus(dossier?.status || dossier?.stage) === "candidate") || dossiers[0] || null;
  const editingResearch = getResearchBeingEdited();
  const researchIntro =
    featuredDossier?.thesis ||
    featuredDossier?.summary ||
    "Collect thesis evidence here before it becomes a candidate recommendation.";

  return `
    <main class="office-content research-content">
      ${renderStatusBanner()}
      ${renderOperatorNotice()}
      <section class="office-panel office-summary-panel research-hero">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Research first</span>
            <h2>Dossiers before candidate approval</h2>
            <p class="section-copy">This view makes the upstream work explicit: thesis evidence, source quality, and conservative math before a decision gets promoted.</p>
          </div>
          <button class="mini-chip" data-view="decisions">Back to Decisions</button>
        </div>
        <div class="office-summary-grid research-summary-grid">
          <article class="office-metric">
            <span>Dossiers</span>
            <strong>${summary.dossierCount || lifecycleCounts.totalCount}</strong>
            <small>${summary.totalCount || lifecycleCounts.totalCount} total research packets</small>
          </article>
          <article class="office-metric">
            <span>Candidate theses</span>
            <strong>${summary.candidateCount ?? lifecycleCounts.candidateCount}</strong>
            <small>Waiting for approval or dismissal</small>
          </article>
          <article class="office-metric">
            <span>Approved theses</span>
            <strong>${summary.approvedCount ?? lifecycleCounts.approvedCount}</strong>
            <small>Allowed to inform the downstream book</small>
          </article>
          <article class="office-metric">
            <span>Research quality</span>
            <strong>${formatDecisionMathValue(summary.averageSourceQualityScore, { probability: true })}</strong>
            <small>Avg source quality across the dossier set</small>
          </article>
        </div>
        <div class="research-intro-panel">
          <div>
            <span class="eyebrow">Featured thesis</span>
            <h3>${escapeHtml(getResearchDossierHeadline(featuredDossier, "No dossier yet"))}</h3>
            <p>${escapeHtml(researchIntro)}</p>
          </div>
          <div class="research-intro-pills">
            ${featuredDossier ? renderLifecyclePill(featuredDossier.status || featuredDossier.stage) : `<span class="pill pill-muted">Discovery</span>`}
            <span class="pill pill-muted">${summary.activeThemeCount || scorecards.length || 0} themes</span>
            <span class="pill pill-muted">${summary.averageTimelinessScore != null ? `Timeliness ${formatDecisionMathValue(summary.averageTimelinessScore, { probability: true })}` : "Timeliness pending"}</span>
          </div>
        </div>
      </section>
      <section class="office-grid office-grid-two research-grid">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Manual intake</span>
              <h3>${editingResearch ? "Edit dossier" : "Capture a research dossier"}</h3>
            </div>
            ${
              editingResearch
                ? `<button class="mini-chip" type="button" data-cancel-research-edit>New dossier</button>`
                : `<button class="mini-chip" data-view="signals">Open Feed</button>`
            }
          </div>
          <form class="operator-form office-form" data-research-form>
            <div class="field-grid">
              <label class="form-field">
                <span>Title</span>
                <input name="title" value="${escapeHtml(editingResearch?.title || "")}" placeholder="AI capex broadening" />
              </label>
              <label class="form-field">
                <span>Theme</span>
                <input name="theme" value="${escapeHtml(editingResearch?.theme || "")}" placeholder="AI, semis, macro, crypto" />
              </label>
              <label class="form-field">
                <span>Assets</span>
                <input name="assets" value="${escapeHtml(getResearchDossierAssets(editingResearch).join(", "))}" placeholder="NVDA, SOXX, BTC" />
              </label>
              <label class="form-field">
                <span>Horizon</span>
                <input name="horizon" value="${escapeHtml(editingResearch?.horizon || "")}" placeholder="3-8 weeks" />
              </label>
            </div>
            <label class="form-field">
              <span>Thesis</span>
              <textarea name="thesis" rows="4" placeholder="State the thesis in one clear paragraph.">${escapeHtml(editingResearch?.thesis || "")}</textarea>
            </label>
            <label class="form-field">
              <span>Supporting evidence</span>
              <textarea name="supportingEvidence" rows="4" placeholder="One item per line">${escapeHtml(getResearchEvidenceList(editingResearch, "supportingEvidence").map(formatEvidenceItem).join("\n"))}</textarea>
            </label>
            <label class="form-field">
              <span>Contradicting evidence</span>
              <textarea name="contradictingEvidence" rows="4" placeholder="One item per line">${escapeHtml(getResearchEvidenceList(editingResearch, "contradictingEvidence").map(formatEvidenceItem).join("\n"))}</textarea>
            </label>
            <label class="form-field">
              <span>Citations</span>
              <textarea name="citations" rows="3" placeholder="One source per line">${escapeHtml(getResearchEvidenceList(editingResearch, "citations").map(formatEvidenceItem).join("\n"))}</textarea>
            </label>
            <div class="field-grid">
              <label class="form-field">
                <span>Source quality</span>
                <input name="sourceQualityScore" type="number" min="0" max="1" step="0.01" value="${escapeHtml(String(editingResearch?.sourceQualityScore ?? ""))}" placeholder="0.65" />
              </label>
              <label class="form-field">
                <span>Timeliness</span>
                <input name="timelinessScore" type="number" min="0" max="1" step="0.01" value="${escapeHtml(String(editingResearch?.timelinessScore ?? ""))}" placeholder="0.72" />
              </label>
              <label class="form-field">
                <span>Status</span>
                <select name="status">
                  ${["discovery", "candidate", "validated", "approved", "dismissed", "expired", "archived"]
                    .map((status) => `<option value="${status}" ${normalizeResearchStatus(editingResearch?.status || editingResearch?.stage || "discovery") === status ? "selected" : ""}>${formatEnumLabel(status)}</option>`)
                    .join("")}
                </select>
              </label>
            </div>
            <label class="form-field">
              <span>Edge hypothesis</span>
              <textarea name="edgeHypothesis" rows="3" placeholder="Why might the market be underpricing or overpricing this thesis?">${escapeHtml(editingResearch?.edgeHypothesis || "")}</textarea>
            </label>
            <label class="form-field">
              <span>Risk factors</span>
              <input name="riskFactors" value="${escapeHtml((editingResearch?.riskFactors || []).map(formatEvidenceItem).join(", "))}" placeholder="Demand fade, policy risk, valuation stretch" />
            </label>
            <div class="office-form-actions">
              <button class="refresh-button" type="submit" ${state.isMutating ? "disabled" : ""}>
                ${state.isMutating ? "Saving..." : editingResearch ? "Save dossier" : "Create dossier"}
              </button>
              <button class="mini-chip" type="button" data-view="decisions">Back to Decisions</button>
            </div>
          </form>
        </section>
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Promotion rules</span>
              <h3>What must be true before approval</h3>
            </div>
          </div>
          <div class="office-checklist">
            <div class="office-checklist-row is-complete">
              <strong>Discovery can be quick</strong>
              <span>Capture</span>
              <p>Drafts can be rough notes, pasted research, or early theses.</p>
            </div>
            <div class="office-checklist-row">
              <strong>Validation needs evidence</strong>
              <span>Gate</span>
              <p>To validate, the dossier must have assets, horizon, supporting evidence, contradicting evidence, and citations.</p>
            </div>
            <div class="office-checklist-row">
              <strong>Approval unlocks actioning</strong>
              <span>Guardrail</span>
              <p>Advisor and queue flows stay conservative until the thesis is explicitly approved.</p>
            </div>
          </div>
        </section>
      </section>
      <section class="office-grid office-grid-two research-grid">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Lifecycle</span>
              <h3>Research to candidate flow</h3>
            </div>
          </div>
          ${renderResearchLifecycleBoard(dossiers)}
        </section>
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Scorecards</span>
              <h3>Source and theme signal quality</h3>
            </div>
          </div>
          <div class="research-scorecard-grid">
            ${
              scorecards.length
                ? scorecards
                    .map((scorecard) => {
                      const score = scorecard?.score ?? scorecard?.value ?? scorecard?.sourceQualityScore ?? scorecard?.timelinessScore;
                      const label = scorecard?.title || scorecard?.theme || scorecard?.source || scorecard?.name || "Scorecard";
                      const supporting = scorecard?.supportingEvidenceCount ?? scorecard?.supportingCount ?? scorecard?.sampleCount;
                      const contrarian = scorecard?.contradictingEvidenceCount ?? scorecard?.contradictingCount ?? scorecard?.negativeCount;

                      return `
                        <article class="research-scorecard">
                          <div class="decision-topline">
                            <strong>${escapeHtml(String(label))}</strong>
                            <span class="tag">${formatDecisionMathValue(score, { probability: true })}</span>
                          </div>
                          <p>${escapeHtml(scorecard?.summary || scorecard?.body || scorecard?.notes || "No scorecard summary provided.")}</p>
                          <div class="research-scorecard-meta">
                            <span class="tag">${supporting != null ? `${supporting} supportive` : "Supportive count pending"}</span>
                            <span class="tag">${contrarian != null ? `${contrarian} conflicting` : "Conflicting count pending"}</span>
                          </div>
                        </article>
                      `;
                    })
                    .join("")
                : `
                  <article class="status-inline">
                    <strong>No scorecards yet</strong>
                    <p>The research block can publish source and theme scorecards here once they are available.</p>
                  </article>
                `
            }
          </div>
        </section>
      </section>
      <section class="office-panel">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Dossiers</span>
            <h3>Evidence before decisioning</h3>
          </div>
          <div class="office-form-actions">
            <button class="mini-chip" data-view="signals">Open Feed</button>
            <button class="mini-chip" data-view="decisions">Back to Decisions</button>
          </div>
        </div>
        ${
          dossiers.length
            ? `
              <div class="research-dossier-grid">
                ${dossiers.map((dossier) => renderResearchDossierCard(dossier)).join("")}
              </div>
            `
            : `
              <article class="status-inline">
                <strong>No dossiers yet</strong>
                <p>When the app-data payload exposes a research dossier list, the evidence trail will appear here.</p>
              </article>
            `
        }
      </section>
    </main>
  `;
}

function renderAssetsView() {
  const profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile;
  const watchedUniverse = getWatchedUniverse(profile);
  const asset = watchedUniverse.find((item) => item.ticker === state.selectedAsset);

  if (!asset) {
    return renderEmptyState(
      "The watched universe has not loaded yet.",
      "Once the API responds, the curated universe plus your portfolio and watchlist will appear here."
    );
  }

  const decision = getDecisionByAsset(asset.ticker);
  const relatedResearch = getResearchDossiers().filter((dossier) =>
    getResearchDossierAssets(dossier).includes(asset.ticker)
  );
  const relatedClusters = decision?.clusterIds?.length
    ? decision.clusterIds.map((clusterId) => getCluster(clusterId)).filter(Boolean)
    : getData().clusters.filter((cluster) => cluster.mappedAssets.includes(asset.ticker));

  return `
    <main class="content-shell">
      ${renderStatusBanner()}
      ${renderOperatorNotice()}
      <section class="section-card asset-shell">
        <div class="asset-rail">
          <div class="section-header compact">
            <div>
              <span class="eyebrow">Watched universe</span>
              <h3>Curated universe plus your saved portfolio and watchlist</h3>
            </div>
          </div>
          <div class="asset-list">
            ${watchedUniverse
              .map((item) => {
                const itemDecision = getDecisionByAsset(item.ticker);
                const itemLabel = item.isTracked
                  ? item.bucket && item.bucket !== item.trackingLabel
                    ? `${item.trackingLabel} · ${item.bucket}`
                    : item.trackingLabel || item.bucket
                  : item.bucket;
                return `
                  <button class="asset-item ${state.selectedAsset === item.ticker ? "is-selected" : ""}" data-asset="${item.ticker}">
                    <div>
                      <strong>${item.ticker}</strong>
                      <span>${escapeHtml(itemLabel)}</span>
                    </div>
                    <span class="decision-badge decision-${(itemDecision?.action || "hold").toLowerCase()}">${itemDecision?.action || "WATCH"}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
        <div class="asset-panel">
          <div class="asset-header">
            <div>
              <span class="eyebrow">${escapeHtml(asset.type)}</span>
              <h2>${escapeHtml(asset.name)} <span class="muted">${asset.ticker}</span></h2>
              <p>${escapeHtml(asset.thesis)}</p>
              ${
                asset.isTracked
                  ? `
                    <div class="chip-row">
                      <span class="pill pill-muted">${escapeHtml(asset.trackingLabel)}</span>
                      ${!asset.isCurated ? '<span class="pill pill-muted">Personal asset</span>' : ""}
                      ${!asset.isCurated && !asset.personalNotes && !asset.personalCategory ? '<span class="pill pill-muted">Add notes to sharpen impact matching</span>' : ""}
                    </div>
                  `
                  : ""
              }
            </div>
            <div class="asset-highlight">
              <span class="decision-badge decision-${(decision?.action || "hold").toLowerCase()}">${decision?.action || "WATCH"}</span>
              <strong>${decision ? formatPercent(decision.confidence) : "--"}</strong>
              <span>${decision?.horizon || "No live decision"}</span>
            </div>
          </div>
          <div class="asset-grid">
            ${renderAssetDecision(asset, decision)}
            <article class="section-card nested-card">
              <span class="eyebrow">Market context</span>
              <h3>Confirmation inputs</h3>
              <div class="context-grid">
                ${
                  decision
                    ? Object.entries(decision.marketContext)
                        .map(
                          ([key, value]) => `
                          <div class="context-item">
                            <span>${formatContextLabel(key)}</span>
                            <strong>${value}</strong>
                          </div>
                        `
                        )
                        .join("")
                    : `
                      <div class="context-item">
                        <span>Status</span>
                        <strong>Waiting for stronger evidence</strong>
                      </div>
                    `
                }
              </div>
              <p class="subtle">Risk flag: ${asset.riskFlag}</p>
            </article>
            <article class="section-card nested-card full-span">
              <span class="eyebrow">Research context</span>
              <h3>Evidence packets tied to ${asset.ticker}</h3>
              ${
                relatedResearch.length
                  ? `
                    <div class="research-linked-grid">
                      ${relatedResearch
                        .slice(0, 3)
                        .map(
                          (dossier) => `
                            <article class="research-linked-card">
                              <div class="decision-topline">
                                <strong>${escapeHtml(getResearchDossierHeadline(dossier))}</strong>
                                ${renderLifecyclePill(dossier.status || dossier.stage)}
                              </div>
                              <p>${escapeHtml(dossier.thesis || dossier.summary || "No thesis summary provided.")}</p>
                              <div class="chip-row">
                                <button class="mini-chip" data-view="decisions">Open Decisions</button>
                              </div>
                            </article>
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : `<p class="subtle">No linked research dossier is present in the current payload.</p>`
              }
            </article>
            <article class="section-card nested-card full-span">
              <span class="eyebrow">Linked event clusters</span>
              <h3>What actually moved this recommendation</h3>
              <div class="cluster-grid compact-grid">
                ${relatedClusters
                  .map(
                    (cluster) => `
                    <article class="cluster-card">
                      <div class="cluster-meta">
                        <span class="pill">${cluster.policyOutcome}</span>
                        <span>${cluster.sourceAgreement}</span>
                      </div>
                      <h4>${cluster.title}</h4>
                      <p>${cluster.marketContext}</p>
                      <details>
                        <summary>Contributing posts</summary>
                        <ul>
                          ${getPostsForCluster(cluster.id)
                            .map((post) => {
                              const source = getSource(post.sourceId);
                              return `<li><button class="inline-link" data-source="${source?.id || ""}">${source?.handle || "Unknown source"}</button>: ${post.body}</li>`;
                            })
                            .join("")}
                        </ul>
                      </details>
                    </article>
                  `
                  )
                  .join("")}
              </div>
            </article>
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderSetupPage() {
  const profile = getProfileDraft();
  const onboardingSummary = buildOnboardingSummary(profile);
  const setupState = buildSingleUserSetupState(profile);

  return `
    <main class="office-content">
      ${renderStatusBanner()}
      ${
        state.advisorError
          ? `
            <article class="office-panel status-inline status-inline-error">
              <strong>Portfolio issue</strong>
              <p>${state.advisorError}</p>
            </article>
          `
          : ""
      }
      ${
        state.advisorNotice
          ? `
            <article class="office-panel status-inline status-success">
              <strong>Portfolio updated</strong>
              <p>${state.advisorNotice}</p>
            </article>
          `
          : ""
      }
      <section class="office-panel today-hero-panel">
        <div class="today-hero-grid">
          <div class="today-hero-copy">
            <span class="eyebrow">Portfolio</span>
            <h2>Set up the desk with the minimum that matters</h2>
            <p>Start with your watchlist and what you own. Everything else is optional and can be added later when you want sharper advice.</p>
          </div>
          <div class="today-hero-stats">
            <article class="today-stat-card">
              <span>Tracked assets</span>
              <strong>${onboardingSummary.trackedAssetCount}</strong>
              <small>${(profile.watchlist || []).length} watchlist names</small>
            </article>
            <article class="today-stat-card">
              <span>Holdings value</span>
              <strong>${formatCurrency(onboardingSummary.holdingsTotal)}</strong>
              <small>${profile.holdings.length} holdings saved</small>
            </article>
            <article class="today-stat-card">
              <span>Safety buffer</span>
              <strong>${formatCurrency(profile.emergencyFund || 0)}</strong>
              <small>${profile.targetEmergencyFundMonths || 6} target months</small>
            </article>
            <article class="today-stat-card">
              <span>Setup progress</span>
              <strong>${setupState.completedCount}/4</strong>
              <small>${setupState.nextStep?.title || "All core steps covered"}</small>
            </article>
          </div>
        </div>
      </section>
      <section class="office-grid office-grid-sidebar">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Portfolio</span>
              <h2>Essentials first</h2>
              <p class="section-copy">If you only fill one section, make it the basics below. The app becomes useful quickly once it knows your names and general frame.</p>
            </div>
          </div>
          <form class="operator-form office-form" data-profile-form>
            <section class="office-form-section">
              <div class="office-panel-head">
                <div>
                  <span class="eyebrow">Basics</span>
                  <h3>Investor frame and watchlist</h3>
                </div>
              </div>
              <div class="field-grid">
                <label class="form-field">
                  <span>Investor name</span>
                  <input name="investorName" value="${escapeHtml(profile.investorName || "")}" placeholder="Your name or household label" />
                </label>
                <label class="form-field">
                  <span>Risk tolerance</span>
                  <input name="riskTolerance" value="${escapeHtml(profile.riskTolerance || "Moderate")}" placeholder="Conservative, Moderate, Growth..." />
                </label>
                <label class="form-field">
                  <span>Investment horizon</span>
                  <input name="investmentHorizon" value="${escapeHtml(profile.investmentHorizon || "")}" placeholder="10+ years, 3 years, liquidity reserve..." />
                </label>
                <label class="form-field">
                  <span>Liquidity needs</span>
                  <input name="liquidityNeeds" value="${escapeHtml(profile.liquidityNeeds || "")}" placeholder="Low, medium, high" />
                </label>
              </div>
              <label class="form-field">
                <span>Watchlist tickers</span>
                <input
                  name="watchlist"
                  value="${escapeHtml((profile.watchlist || []).join(", "))}"
                  placeholder="NVDA, BTC, VWCE, MSFT"
                />
              </label>
              <label class="form-field">
                <span>Goals</span>
                <input
                  name="goals"
                  value="${escapeHtml((profile.goals || []).join(", "))}"
                  placeholder="Retirement, preserve liquidity, home purchase"
                />
              </label>
              <label class="form-field">
                <span>Notes</span>
                <textarea name="notes" rows="3" placeholder="Anything the advisor should keep in mind about concentration, liquidity, or personal constraints.">${escapeHtml(profile.notes || "")}</textarea>
              </label>
            </section>
            <section class="office-form-section">
              <div class="office-panel-head">
                <div>
                  <span class="eyebrow">Holdings</span>
                  <h3>What you actually own</h3>
                </div>
              </div>
              ${renderProfileCollectionSection({
                collection: "holdings",
                title: "Holdings",
                copy: "Stocks, ETFs, crypto, cash sleeves, and any core positions you want the desk to prioritize.",
                addLabel: "Add holding",
                emptyCopy: "Start with a few real positions. You can always add the rest later.",
                fields: [
                  {
                    key: "ticker",
                    label: "Ticker or label",
                    placeholder: "VWCE, MSFT, BTC, Cash"
                  },
                  {
                    key: "category",
                    label: "Category",
                    type: "select",
                    options: ["Stock", "ETF", "Fund", "Crypto", "Cash", "Bond", "Other"]
                  },
                  {
                    key: "accountType",
                    label: "Account / wrapper",
                    type: "select",
                    options: [
                      "Brokerage",
                      "Retirement account",
                      "Pension wrapper",
                      "Savings account",
                      "Cold wallet",
                      "Other"
                    ]
                  },
                  {
                    key: "currentValue",
                    label: "Current value",
                    type: "number",
                    placeholder: "0"
                  },
                  {
                    key: "costBasis",
                    label: "Cost basis",
                    type: "number",
                    placeholder: "0"
                  },
                  {
                    key: "notes",
                    label: "Notes",
                    type: "textarea",
                    rows: 2,
                    placeholder: "Core position, long-term sleeve, concentration note..."
                  }
                ]
              })}
            </section>
            <details class="office-disclosure">
              <summary>Optional: cash, safety buffer, and liabilities</summary>
              <section class="office-form-section">
                <div class="field-grid">
                  <label class="form-field">
                    <span>Monthly net income</span>
                    <input type="number" step="0.01" name="monthlyNetIncome" value="${profile.monthlyNetIncome ?? 0}" />
                  </label>
                  <label class="form-field">
                    <span>Monthly expenses</span>
                    <input type="number" step="0.01" name="monthlyExpenses" value="${profile.monthlyExpenses ?? 0}" />
                  </label>
                  <label class="form-field">
                    <span>Emergency fund</span>
                    <input type="number" step="0.01" name="emergencyFund" value="${profile.emergencyFund ?? 0}" />
                  </label>
                  <label class="form-field">
                    <span>Target emergency months</span>
                    <input type="number" step="0.1" name="targetEmergencyFundMonths" value="${profile.targetEmergencyFundMonths ?? 6}" />
                  </label>
                </div>
                ${renderProfileCollectionSection({
                  collection: "liabilities",
                  title: "Liabilities",
                  copy: "Loans, mortgages, premiums, or other obligations that affect flexibility.",
                  addLabel: "Add liability",
                  emptyCopy: "Optional. Add these later if you want the advice to reflect fixed commitments more precisely.",
                  fields: [
                    {
                      key: "label",
                      label: "Name",
                      placeholder: "Apartment mortgage, KfW loan"
                    },
                    {
                      key: "category",
                      label: "Category",
                      type: "select",
                      options: ["Mortgage", "Personal loan", "Credit line", "Insurance premium", "Tax due", "Other"]
                    },
                    {
                      key: "balance",
                      label: "Outstanding balance",
                      type: "number",
                      placeholder: "0"
                    },
                    {
                      key: "interestRate",
                      label: "Interest rate %",
                      type: "number",
                      placeholder: "0"
                    },
                    {
                      key: "monthlyPayment",
                      label: "Monthly payment",
                      type: "number",
                      placeholder: "0"
                    },
                    {
                      key: "notes",
                      label: "Notes",
                      type: "textarea",
                      rows: 2,
                      placeholder: "Optional details like fixed-rate end date or lender"
                    }
                  ]
                })}
              </section>
            </details>
            <details class="office-disclosure">
              <summary>Optional: long-term products and pension wrappers</summary>
              <section class="office-form-section">
                ${renderProfileCollectionSection({
                  collection: "retirementProducts",
                  title: "Insurance and pensions",
                  copy: "Private pensions, bAV, wrappers, and other long-term products.",
                  addLabel: "Add product",
                  emptyCopy: "Optional. Add these if you want the app to reflect more of your total balance sheet.",
                  fields: [
                    {
                      key: "label",
                      label: "Product name",
                      placeholder: "Private pension, BU policy, life insurance"
                    },
                    {
                      key: "type",
                      label: "Type",
                      type: "select",
                      options: ["Private Rentenversicherung", "bAV", "Life insurance", "Disability insurance", "Health insurance", "Other"]
                    },
                    {
                      key: "provider",
                      label: "Provider",
                      placeholder: "Allianz, Alte Leipziger, employer plan"
                    },
                    {
                      key: "currentValue",
                      label: "Current value",
                      type: "number",
                      placeholder: "0"
                    },
                    {
                      key: "monthlyContribution",
                      label: "Monthly contribution",
                      type: "number",
                      placeholder: "0"
                    },
                    {
                      key: "notes",
                      label: "Notes",
                      type: "textarea",
                      rows: 2,
                      placeholder: "Guarantees, surrender limits, tax treatment..."
                    }
                  ]
                })}
              </section>
            </details>
            <div class="office-form-actions">
              <button class="refresh-button" type="submit" ${state.isSavingProfile ? "disabled" : ""}>
                ${state.isSavingProfile ? "Saving..." : "Save portfolio"}
              </button>
              <button class="mini-chip" type="button" data-view="signals">Open Feed</button>
            </div>
          </form>
        </section>
        <aside class="office-sidebar">
          <section class="office-panel">
            <div class="office-panel-head">
              <div>
                <span class="eyebrow">Status</span>
                <h3>Current state</h3>
              </div>
            </div>
            <div class="office-checklist">
              ${setupState.steps
                .map(
                  (step) => `
                    <div class="office-checklist-row ${step.complete ? "is-complete" : ""}">
                      <strong>${step.title}</strong>
                      <span>${step.complete ? "Done" : "Pending"}</span>
                      <p>${step.body}</p>
                    </div>
                  `
                )
                .join("")}
            </div>
          </section>
          <section class="office-panel">
            <div class="office-panel-head">
              <div>
                <span class="eyebrow">Saved totals</span>
                <h3>Portfolio snapshot</h3>
              </div>
            </div>
            <div class="office-summary-list">
              <div><span>Holdings</span><strong>${profile.holdings.length}</strong></div>
              <div><span>Insurance & pensions</span><strong>${formatCurrency(onboardingSummary.retirementTotal)}</strong></div>
              <div><span>Watchlist</span><strong>${(profile.watchlist || []).length}</strong></div>
              <div><span>Tracked assets</span><strong>${onboardingSummary.trackedAssetCount}</strong></div>
              <div><span>Invested assets</span><strong>${formatCurrency(onboardingSummary.holdingsTotal + onboardingSummary.retirementTotal)}</strong></div>
              <div><span>Liabilities</span><strong>${formatCurrency(onboardingSummary.liabilitiesTotal)}</strong></div>
            </div>
          </section>
          <section class="office-panel">
            <div class="office-panel-head">
              <div>
                <span class="eyebrow">Next</span>
                <h3>After saving</h3>
              </div>
            </div>
            <p>Open Feed, import a few real posts, run the pipeline, then come back to Today or Decisions.</p>
            <div class="office-form-actions">
              <button class="mini-chip" data-view="signals">Open Feed</button>
              <button class="mini-chip" data-view="dashboard">Back to Today</button>
            </div>
          </section>
        </aside>
      </section>
    </main>
  `;
}

function renderSignalsPage() {
  const recentPosts = getRecentAnalysedPosts().slice(0, 12);
  const status = getStoreStatus();
  const bySourceRows = (status.bySource || [])
    .slice(0, 6)
    .map((entry) => {
      const source = getSource(entry.sourceId);

      return `
        <tr>
          <td>${source?.handle || entry.sourceId}</td>
          <td>${entry.count}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <main class="office-content">
      ${renderStatusBanner()}
      ${renderOperatorNotice()}
      <section class="office-panel office-summary-panel">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Feed</span>
            <h2>Bring in posts and see what the desk noticed</h2>
            <p class="section-copy">Use this page to bring signal input into the app, then inspect the posts that are shaping the current brief.</p>
          </div>
          <div class="office-form-actions">
            <button class="mini-chip" type="button" data-run-pipeline ${state.isRunningPipeline ? "disabled" : ""}>
              ${state.isRunningPipeline ? "Running..." : "Run pipeline"}
            </button>
            <button class="mini-chip" data-view="dashboard">Back to Today</button>
          </div>
        </div>
        <div class="office-summary-grid">
          <article class="office-metric">
            <span>Feed mode</span>
            <strong>${formatEnumLabel(status.mode || "fake")}</strong>
            <small>${status.postCount || 0} posts in store</small>
          </article>
          <article class="office-metric">
            <span>Recent posts</span>
            <strong>${recentPosts.length}</strong>
            <small>Last 3-day analysis window</small>
          </article>
          <article class="office-metric">
            <span>Sources covered</span>
            <strong>${status.sourcesCovered || 0}</strong>
            <small>Unique monitored handles</small>
          </article>
          <article class="office-metric">
            <span>Actionable</span>
            <strong>${status.actionableCount || 0}</strong>
            <small>${status.decisionCount || 0} decisions in latest snapshot</small>
          </article>
        </div>
      </section>
      <section class="office-grid office-grid-two">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Import</span>
              <h3>Paste posts, links, or notes</h3>
            </div>
          </div>
          <form class="operator-form office-form" data-manual-feed-form>
            <input type="hidden" name="manualSourceId" value="" />
            <div class="field-grid">
              <label class="form-field">
                <span>Source handle</span>
                <input name="manualSourceHandle" value="@personaldesk" />
              </label>
              <label class="form-field">
                <span>Source name</span>
                <input name="manualSourceName" value="Personal desk" />
              </label>
              <label class="form-field">
                <span>Category</span>
                <input name="manualSourceCategory" value="Operator" />
              </label>
              <label class="form-field">
                <span>Allowed assets</span>
                <input name="manualAllowedAssets" placeholder="NVDA, BTC, MSFT" />
              </label>
            </div>
            <label class="form-field">
              <span>Relevant sectors</span>
              <input name="manualRelevantSectors" placeholder="AI, semis, macro, crypto" />
            </label>
            <label class="form-field">
              <span>Raw input</span>
              <textarea
                name="manualRawText"
                rows="10"
                placeholder="@semiflow: Broadening risk appetite keeps semis bid; still constructive on NVDA.&#10;https://x.com/example/status/123&#10;Manual note: BTC positioning looks louder than spot demand."
              ></textarea>
            </label>
            <label class="checkbox-field">
              <input type="checkbox" name="manualReplaceExisting" />
              <span>Replace the current manual feed instead of appending</span>
            </label>
            <div class="office-form-actions">
              <button class="refresh-button" type="submit" ${state.isMutating ? "disabled" : ""}>
                ${state.isMutating ? "Importing..." : "Import signals"}
              </button>
            </div>
          </form>
        </section>
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Coverage</span>
              <h3>Posts by source</h3>
            </div>
          </div>
          <table class="office-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Posts</th>
              </tr>
            </thead>
            <tbody>${bySourceRows || '<tr><td colspan="2">No source data yet.</td></tr>'}</tbody>
          </table>
        </section>
      </section>
      <section class="office-panel">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Latest posts</span>
            <h3>What the desk is currently reading</h3>
          </div>
          <button class="mini-chip" data-view="decisions">Open Decisions</button>
        </div>
        <table class="office-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Time</th>
              <th>Claim</th>
              <th>Mapped assets</th>
              <th>Post</th>
            </tr>
          </thead>
          <tbody>
            ${
              recentPosts.length
                ? recentPosts
                    .map((post) => {
                      const source = getSource(post.sourceId);

                      return `
                        <tr>
                          <td>${source?.handle || post.sourceId}</td>
                          <td>${formatGeneratedAt(post.createdAt)}</td>
                          <td>${post.claimType || "Unknown"}</td>
                          <td>${renderAssetMappingCell(post)}</td>
                          <td>${post.body}</td>
                        </tr>
                      `;
                    })
                    .join("")
                : '<tr><td colspan="5">No analysed posts yet.</td></tr>'
            }
          </tbody>
        </table>
      </section>
    </main>
  `;
}

function renderAdvisorView() {
  const advisor = getAdvisor();
  const profile = advisor.financialProfile || EMPTY_DATA.advisor.financialProfile;
  const watchedUniverse = getWatchedUniverse(profile);
  const latestAnswer = getLatestAdvisorAnswer();
  const setupState = buildSingleUserSetupState(profile);
  const trackedTickers = getTrackedAssetTickers(profile);
  const suggestedTickers = trackedTickers.length
    ? trackedTickers
    : watchedUniverse.slice(0, 6).map((asset) => asset.ticker);
  const relatedSignals = sortPostsByCreatedAt(
    getData().posts.filter((post) => getPostExposureTickers(post, profile).some((asset) => suggestedTickers.includes(asset)))
  ).slice(0, 4);
  const canAsk = Boolean(suggestedTickers.length && setupState.hasDecisionFrame);
  const cashSummary = buildProfileCashSummary(profile);
  const advisorFocusTicker = latestAnswer?.assetTicker || suggestedTickers[0] || "";
  const advisorFocusDecision = advisorFocusTicker ? getDecisionByAsset(advisorFocusTicker) : null;
  const advisorFocusResearch = advisorFocusTicker
    ? getResearchForAsset(advisorFocusTicker, advisorFocusDecision)
    : null;

  return `
    <main class="office-content">
      ${renderStatusBanner()}
      ${
        state.advisorError
          ? `
            <article class="office-panel status-inline status-inline-error">
              <strong>Advisor issue</strong>
              <p>${state.advisorError}</p>
            </article>
          `
          : ""
      }
      ${
        state.advisorNotice
          ? `
            <article class="office-panel status-inline status-success">
              <strong>Advisor update</strong>
              <p>${state.advisorNotice}</p>
            </article>
          `
          : ""
      }
      <section class="office-panel office-summary-panel">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Advisor</span>
            <h2>Focused portfolio questions</h2>
            <p class="section-copy">Use this page when you want a grounded answer on one asset, with your saved portfolio and the latest approved context in view.</p>
          </div>
          <div class="office-inline-meta">
            ${suggestedTickers.slice(0, 4).map((ticker) => `<span>${ticker}</span>`).join("")}
          </div>
        </div>
        <div class="office-summary-grid">
          <article class="office-metric">
            <span>Suggested assets</span>
            <strong>${suggestedTickers.length}</strong>
            <small>From holdings and watchlist</small>
          </article>
          <article class="office-metric">
            <span>Holdings</span>
            <strong>${profile.holdings.length}</strong>
            <small>${trackedTickers.length} tracked names</small>
          </article>
          <article class="office-metric">
            <span>Safety buffer</span>
            <strong>${cashSummary.emergencyCoverageMonths ? `${cashSummary.emergencyCoverageMonths}m` : "Pending"}</strong>
            <small>${formatEnumLabel(getFeedMode())} feed</small>
          </article>
          <article class="office-metric">
            <span>Latest answer</span>
            <strong>${latestAnswer ? latestAnswer.assetTicker : "None"}</strong>
            <small>${latestAnswer ? formatGeneratedAt(latestAnswer.createdAt) : "Ask the first question"}</small>
          </article>
        </div>
      </section>
      ${
        !canAsk
          ? `
            <section class="office-panel status-inline">
              <strong>Setup is incomplete</strong>
              <p>Save a few goals and at least one watchlist or holding in Portfolio before relying on the advisor.</p>
              <div class="office-form-actions">
                <button class="mini-chip" data-view="setup">Open portfolio</button>
              </div>
            </section>
          `
          : ""
      }
      <section class="office-grid office-grid-two">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Ask a question</span>
              <h3>Request a focused opinion</h3>
            </div>
          </div>
          <form class="operator-form office-form" data-advisor-form>
            <label class="form-field">
              <span>Asset</span>
              <input name="assetTicker" list="advisor-asset-list" value="${escapeHtml(latestAnswer?.assetTicker || suggestedTickers[0] || "")}" placeholder="BTC, NVDA, VTI..." />
              <datalist id="advisor-asset-list">
                ${watchedUniverse
                  .map(
                    (asset) => `
                    <option value="${asset.ticker}">${escapeHtml(asset.name)}</option>
                  `
                  )
                  .join("")}
              </datalist>
            </label>
            <label class="form-field">
              <span>Question</span>
              <textarea name="question" rows="6" placeholder="Should I add over the next month given my cash buffer, holdings concentration, and the latest signals?"></textarea>
            </label>
            <div class="office-form-actions">
              <button class="refresh-button" type="submit" ${state.isAskingAdvisor ? "disabled" : ""}>
                ${state.isAskingAdvisor ? "Generating answer..." : "Ask advisor"}
              </button>
              <button class="mini-chip" type="button" data-view="setup">Open portfolio</button>
            </div>
          </form>
          ${
            advisorFocusTicker
              ? `
                <div class="research-linked-grid">
                  ${renderLinkedResearchCard(advisorFocusResearch, advisorFocusDecision, {
                    includeActions: true
                  })}
                </div>
              `
              : ""
          }
        </section>
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Latest answer</span>
              <h3>${latestAnswer ? latestAnswer.answer.headline : "No answer generated yet"}</h3>
            </div>
          </div>
          ${
            latestAnswer
              ? `
                <p>${latestAnswer.answer.answer}</p>
                <div class="office-inline-meta">
                  <span>${latestAnswer.assetTicker}</span>
                  <span>${latestAnswer.answer.stance}</span>
                  <span>${latestAnswer.answer.suitability}</span>
                  <span>${formatPercent(latestAnswer.answer.confidence || 0)}</span>
                </div>
                <div class="details-stack office-details">
                  <div>
                    <strong>Rationale</strong>
                    <ul>${latestAnswer.answer.rationale.map((item) => `<li>${item}</li>`).join("")}</ul>
                  </div>
                  <div>
                    <strong>Portfolio fit</strong>
                    <ul>${latestAnswer.answer.portfolioFit.map((item) => `<li>${item}</li>`).join("")}</ul>
                  </div>
                  <div>
                    <strong>Risk flags</strong>
                    <ul>${latestAnswer.answer.riskFlags.map((item) => `<li>${item}</li>`).join("")}</ul>
                  </div>
                  <div>
                    <strong>Next steps</strong>
                    <ul>${latestAnswer.answer.nextSteps.map((item) => `<li>${item}</li>`).join("")}</ul>
                  </div>
                </div>
                <p class="subtle">${latestAnswer.answer.disclaimer}</p>
              `
              : `
                <article class="status-inline">
                  <strong>No advice generated yet</strong>
                  <p>Ask a ticker-specific question and the response will be grounded in your saved profile plus the latest snapshot.</p>
                </article>
              `
          }
        </section>
      </section>
      <section class="office-grid office-grid-two">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Recent advisor history</span>
              <h3>Previous questions</h3>
            </div>
          </div>
          <div class="operator-list">
            ${advisor.history.length
              ? advisor.history
                  .map(
                    (entry) => `
                    <article class="operator-card">
                      <div class="operator-card-head">
                        <div>
                          <strong>${entry.assetTicker}</strong>
                          <span>${formatGeneratedAt(entry.createdAt)}</span>
                        </div>
                        <span class="pill pill-muted">${formatEnumLabel(entry.provider)}</span>
                      </div>
                      <p>${entry.question}</p>
                      <small>${entry.answer.headline}</small>
                    </article>
                  `
                  )
                  .join("")
              : '<article class="status-inline"><strong>No advisor history yet</strong><p>Your recent answers will appear here once you start asking focused questions.</p></article>'}
          </div>
        </section>
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Related signals</span>
              <h3>Recent posts touching your suggested names</h3>
            </div>
          </div>
          <table class="office-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Time</th>
                <th>Mapped assets</th>
                <th>Post</th>
              </tr>
            </thead>
            <tbody>
              ${relatedSignals.length
                ? relatedSignals
                    .map((post) => {
                      const source = getSource(post.sourceId);

                      return `
                        <tr>
                          <td>${source?.handle || post.sourceId}</td>
                          <td>${formatGeneratedAt(post.createdAt)}</td>
                          <td>${renderAssetMappingCell(post)}</td>
                          <td>${post.body}</td>
                        </tr>
                      `;
                    })
                    .join("")
                : '<tr><td colspan="4">No recent related signals. Import more posts in the Signals tab when you want fresher context.</td></tr>'}
            </tbody>
          </table>
        </section>
      </section>
    </main>
  `;
}

function renderSourceCards() {
  const { sources } = getData();
  const source = getSource(state.selectedSource);
  const editingSource = getSourceBeingEdited();

  if (!source) {
    return renderEmptyState(
      "The source registry is still loading.",
      "Once the snapshot arrives, different account categories and handling rules will appear here."
    );
  }

  const sourcePosts = getPostsForSource(source.id);
  const sourceReliability = getSourceReliabilityInfo(source);
  const sourceDraft = editingSource || {
    handle: "",
    name: "",
    category: "",
    baselineReliability: 0.6,
    preferredHorizon: "",
    policyTemplate: "",
    relevantSectors: [],
    allowedAssets: [],
    specialHandling: "",
    tone: ""
  };

  return `
    <main class="content-shell">
      ${renderStatusBanner()}
      <section class="section-card asset-shell">
        <div class="asset-rail">
          <div class="section-header compact">
            <div>
              <span class="eyebrow">Source registry</span>
              <h3>Different account types, different handling rules</h3>
            </div>
          </div>
          <div class="source-list">
            ${sources
              .map((item) => {
                const reliability = getSourceReliabilityInfo(item);

                return `
                <button class="source-item ${state.selectedSource === item.id ? "is-selected" : ""}" data-source="${item.id}">
                  <div>
                    <strong>${item.handle}</strong>
                    <span>${item.category}</span>
                  </div>
                  <small>${formatPercent(reliability.score)} · ${escapeHtml(reliability.label)}</small>
                </button>
              `;
              })
              .join("")}
          </div>
        </div>
        <div class="asset-panel">
          <div class="asset-header">
            <div>
              <span class="eyebrow">${source.category}</span>
              <h2>${source.name} <span class="muted">${source.handle}</span></h2>
              <p>${source.specialHandling}</p>
            </div>
            <div class="asset-highlight">
              <span class="pill">${source.preferredHorizon}</span>
              <strong>${formatPercent(sourceReliability.score)}</strong>
              <span>${escapeHtml(sourceReliability.label)}</span>
            </div>
          </div>
          <div class="asset-grid">
            <article class="section-card nested-card">
              <span class="eyebrow">Registry metadata</span>
              <h3>${source.policyTemplate}</h3>
              <div class="context-grid">
                <div class="context-item">
                  <span>Relevant sectors</span>
                  <strong>${source.relevantSectors.join(", ")}</strong>
                </div>
                <div class="context-item">
                  <span>Reliability</span>
                  <strong>${escapeHtml(sourceReliability.label)}</strong>
                </div>
                <div class="context-item">
                  <span>Operator guidance</span>
                  <strong>${escapeHtml(sourceReliability.operatorGuidance)}</strong>
                </div>
                <div class="context-item">
                  <span>Allowed assets</span>
                  <strong>${source.allowedAssets.join(", ")}</strong>
                </div>
                <div class="context-item">
                  <span>Last active</span>
                  <strong>${source.lastActive}</strong>
                </div>
              </div>
            </article>
            <article class="section-card nested-card full-span">
              <span class="eyebrow">Recent posts</span>
              <h3>How this source is being interpreted right now</h3>
              <div class="feed-list">
                ${sourcePosts
                  .map(
                    (post) => `
                    <article class="feed-item">
                      <div class="feed-head">
                        <span>${post.timestamp}</span>
                        <span>${post.claimType}</span>
                      </div>
                      <p>${post.body}</p>
                      <div class="tag-row">
                        <span class="tag">${post.direction}</span>
                        <span class="tag">${post.explicitness}</span>
                        ${renderMappedAssetButtons(post, "tag tag-button")}
                        ${renderAssetMappingStatusTag(post)}
                      </div>
                      ${renderAssetMappingNote(post)}
                      ${renderLikelyImpactSummary(post)}
                    </article>
                  `
                  )
                  .join("")}
              </div>
            </article>
            <article class="section-card nested-card full-span">
              <div class="section-header compact">
                <div>
                  <span class="eyebrow">Manage registry</span>
                  <h3>${editingSource ? `Editing ${escapeHtml(editingSource.handle)}` : "Add or update followed accounts"}</h3>
                </div>
                <div class="office-form-actions">
                  <button class="mini-chip" type="button" data-edit-source="${escapeHtml(source.id)}">Load selected source</button>
                  <button class="mini-chip" type="button" data-new-source>Blank new source</button>
                  ${editingSource ? `<button class="mini-chip" type="button" data-delete-source="${escapeHtml(editingSource.id)}">Delete</button>` : ""}
                </div>
              </div>
              <form class="operator-form office-form" data-source-form>
                <div class="field-grid">
                  <label>
                    <span>Handle</span>
                    <input name="handle" value="${escapeHtml(sourceDraft.handle || "")}" placeholder="@newsource" required />
                  </label>
                  <label>
                    <span>Name</span>
                    <input name="name" value="${escapeHtml(sourceDraft.name || "")}" placeholder="Readable source name" required />
                  </label>
                  <label>
                    <span>Category</span>
                    <input name="category" value="${escapeHtml(sourceDraft.category || "")}" placeholder="Institution / Policy" />
                  </label>
                  <label>
                    <span>Reliability</span>
                    <input name="baselineReliability" type="number" min="0" max="0.99" step="0.01" value="${escapeHtml(String(sourceDraft.baselineReliability ?? 0.6))}" />
                  </label>
                  <label>
                    <span>Preferred horizon</span>
                    <input name="preferredHorizon" value="${escapeHtml(sourceDraft.preferredHorizon || "")}" placeholder="1-5 days" />
                  </label>
                  <label>
                    <span>Tone</span>
                    <input name="tone" value="${escapeHtml(sourceDraft.tone || "")}" placeholder="Measured" />
                  </label>
                </div>
                <div class="field-grid">
                  <label>
                    <span>Policy template</span>
                    <input name="policyTemplate" value="${escapeHtml(sourceDraft.policyTemplate || "")}" placeholder="How this source should be interpreted" />
                  </label>
                  <label>
                    <span>Relevant sectors</span>
                    <input name="relevantSectors" value="${escapeHtml((sourceDraft.relevantSectors || []).join(", "))}" placeholder="Policy, semis, macro" />
                  </label>
                  <label>
                    <span>Allowed assets</span>
                    <input name="allowedAssets" value="${escapeHtml((sourceDraft.allowedAssets || []).join(", "))}" placeholder="NVDA, AMD, SOXX" />
                  </label>
                </div>
                <label>
                  <span>Special handling</span>
                  <textarea name="specialHandling" rows="3" placeholder="How strict should the fact-check / corroboration behavior be for this source?">${escapeHtml(sourceDraft.specialHandling || "")}</textarea>
                </label>
                <div class="office-form-actions">
                  <button class="refresh-button" type="submit" ${state.isMutating ? "disabled" : ""}>
                    ${state.isMutating ? "Saving..." : editingSource ? "Save source" : "Create source"}
                  </button>
                  ${editingSource ? `<button class="mini-chip" type="button" data-new-source>New source</button>` : `<button class="mini-chip" type="button" data-edit-source="${escapeHtml(source.id)}">Edit selected source</button>`}
                </div>
              </form>
            </article>
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderLogs() {
  const history = getHistory();
  const evaluation = getEvaluation();
  const latestRun = history.runs[0] || null;
  const latestEval = evaluation.latestRun || evaluation.history[0] || null;
  const selectedRun = state.selectedRunDetail;
  const selectedEval = state.selectedEvalDetail;
  const selectedRunDecisions = selectedRun?.decisions || [];
  const perFieldAccuracy = Object.entries(selectedEval?.summary?.perFieldAccuracy || {});
  const historyAnalytics = buildDecisionHistoryAnalytics(history.decisionLog);
  const selectedRunHistory = history.decisionLog.filter((entry) => entry.runId === state.selectedRunId);
  const selectedRunAnalytics = buildRunDecisionAnalytics(selectedRunHistory);
  const actionBreakdown = Object.entries(historyAnalytics.actionBreakdown || {}).sort(
    ([left], [right]) => left.localeCompare(right)
  );
  const outcomeBreakdown = Object.entries(historyAnalytics.outcomeBreakdown || {}).sort(
    ([left], [right]) => left.localeCompare(right)
  );
  const selectedScenarioCases = selectedEval?.scenarioCases || [];

  return `
    <main class="content-shell">
      ${renderStatusBanner()}
      <section class="hero-panel logs-hero">
        <div>
          <span class="eyebrow">Run history</span>
          <h2>Decision logs and regression history now persist across pipeline runs.</h2>
          <p>
            The product still stops short of execution, but the engine now stores pipeline snapshots, decision history, ingestion summaries, market context, and eval runs so we can replay what happened and compare prompt changes safely.
          </p>
        </div>
        <div class="hero-decision">
          <span class="pill pill-muted">Stored history</span>
          <strong>${history.runs.length} pipeline runs</strong>
          <p>${latestRun ? `Latest run ${formatShortId(latestRun.id)} was ${formatEnumLabel(latestRun.trigger).toLowerCase()} at ${formatGeneratedAt(latestRun.generatedAt)}.` : "Waiting for the first persisted run."}</p>
        </div>
      </section>
      <section class="stat-grid">
        <article class="stat-card">
          <span class="eyebrow">Decision log</span>
          <strong>${history.decisionLog.length}</strong>
          <p>Flattened asset-level decisions stored across recent pipeline runs.</p>
        </article>
        <article class="stat-card">
          <span class="eyebrow">Latest market regime</span>
          <strong>${latestRun?.marketSummary?.marketRegime || getData().market?.summary?.marketRegime || "Pending"}</strong>
          <p>${latestRun?.marketSummary?.strongestTicker ? `${latestRun.marketSummary.strongestTicker} was the strongest mocked ticker in the latest run.` : "Market context arrives with the persisted pipeline snapshot."}</p>
        </article>
        <article class="stat-card">
          <span class="eyebrow">Latest eval</span>
          <strong>${latestEval ? formatScorePercent(latestEval.summary.averageScore) : "Pending"}</strong>
          <p>${latestEval ? `${latestEval.summary.exactMatchCount}/${latestEval.summary.caseCount} exact matches using ${getEvalMode(latestEval)}, plus ${latestEval.summary.scenarioExactMatchCount || 0}/${latestEval.summary.scenarioCaseCount || 0} scenario passes.` : "Run the eval harness from Operator to populate regression history."}</p>
        </article>
        <article class="stat-card">
          <span class="eyebrow">Prompt version</span>
          <strong>${selectedEval?.promptVersion || latestEval?.promptVersion || "Pending"}</strong>
          <p>${selectedEval?.gate?.passed === false ? "The latest selected eval is currently below at least one regression gate." : "The eval suite records prompt/schema revisions so later model runs can be compared cleanly."}</p>
        </article>
        <article class="stat-card">
          <span class="eyebrow">Avg directional return</span>
          <strong>${formatSignedReturn(historyAnalytics.averageDirectionalReturn)}</strong>
          <p>${historyAnalytics.bestAsset ? `${historyAnalytics.bestAsset.asset} currently leads the stored outcome leaderboard.` : "Directional-return analytics will populate as the decision log grows."}</p>
        </article>
      </section>
      <section class="section-card split-card">
        <div>
          <div class="section-header">
            <div>
              <span class="eyebrow">Pipeline runs</span>
              <h3>Select a persisted engine run</h3>
            </div>
          </div>
          <div class="operator-list">
            ${history.runs
              .map(
                (run) => `
                <button class="replay-button ${state.selectedRunId === run.id ? "is-active" : ""}" data-select-run="${run.id}">
                  <strong>${formatShortId(run.id)}</strong>
                  <span>${formatGeneratedAt(run.generatedAt)}</span>
                  <p>${formatEnumLabel(run.trigger)} · ${run.summary.decisionCount} decisions · ${run.summary.marketRegime}</p>
                </button>
              `
              )
              .join("")}
          </div>
        </div>
        <div>
          <div class="section-header">
            <div>
              <span class="eyebrow">Run detail</span>
              <h3>Replay the stored pipeline snapshot</h3>
            </div>
          </div>
          ${
            state.runDetailError
              ? `
                <article class="status-inline status-inline-error">
                  <strong>Run detail error</strong>
                  <p>${state.runDetailError}</p>
                </article>
              `
              : ""
          }
          ${
            state.isRunDetailLoading
              ? `
                <article class="status-inline">
                  <strong>Loading run detail</strong>
                  <p>Pulling the stored pipeline snapshot for ${state.selectedRunId || "the selected run"}.</p>
                </article>
              `
              : selectedRun
                ? `
                  <div class="context-grid">
                    <article class="context-item">
                      <span>Generated at</span>
                      <strong>${formatGeneratedAt(selectedRun.generatedAt)}</strong>
                    </article>
                    <article class="context-item">
                      <span>Trigger</span>
                      <strong>${formatEnumLabel(selectedRun.trigger)}</strong>
                    </article>
                    <article class="context-item">
                      <span>Extractor mode</span>
                      <strong>${selectedRun.extractor.activeMode}</strong>
                    </article>
                    <article class="context-item">
                      <span>Feed / sources</span>
                      <strong>${selectedRun.sourceFeed.postCount} / ${selectedRun.sourceRegistry.count}</strong>
                    </article>
                    <article class="context-item">
                      <span>Contract version</span>
                      <strong>${selectedRun.ingestion.summary.contractVersion}</strong>
                    </article>
                    <article class="context-item">
                      <span>Market regime</span>
                      <strong>${selectedRun.market.summary.marketRegime}</strong>
                    </article>
                    <article class="context-item">
                      <span>Run avg return</span>
                      <strong>${formatSignedReturn(selectedRunAnalytics.averageDirectionalReturn)}</strong>
                    </article>
                    <article class="context-item">
                      <span>Favorable / against</span>
                      <strong>${selectedRunAnalytics.favorableCount} / ${selectedRunAnalytics.againstCount}</strong>
                    </article>
                  </div>
                  <div class="operator-list">
                    ${selectedRunDecisions
                      .slice(0, 6)
                      .map(
                        (decision) => `
                        <article class="operator-card">
                          <div class="operator-card-head">
                            <div>
                              <strong>${decision.asset}</strong>
                              <span>${decision.horizon}</span>
                            </div>
                            <span class="decision-badge decision-${decision.action.toLowerCase()}">${decision.action}</span>
                          </div>
                          <p>${decision.rationale[0]}</p>
                        </article>
                      `
                      )
                      .join("")}
                  </div>
                  <details>
                    <summary>Ingestion contract snapshot</summary>
                    ${renderJsonBlock(selectedRun.ingestion.summary)}
                  </details>
                  <details>
                    <summary>Market snapshot summary</summary>
                    ${renderJsonBlock(selectedRun.market.summary)}
                  </details>
                `
                : `
                  <article class="status-inline">
                    <strong>Select a pipeline run</strong>
                    <p>Choose a stored run to inspect its ingestion summary, market context, and decision outputs.</p>
                  </article>
                `
          }
        </div>
      </section>
      <section class="section-card split-card">
        <div>
          <div class="section-header">
            <div>
              <span class="eyebrow">Decision log</span>
              <h3>Recent stored asset decisions</h3>
            </div>
          </div>
          <div class="feed-list">
            ${history.decisionLog
              .slice(0, 12)
              .map(
                (entry) => `
                <article class="feed-item">
                  <div class="feed-head">
                    <strong>${entry.asset} ${entry.action}</strong>
                    <span>${formatGeneratedAt(entry.generatedAt)}</span>
                  </div>
                  <p>${entry.summary}</p>
                  <div class="tag-row">
                    <span class="tag">${formatScorePercent(entry.confidence)}</span>
                    <span class="tag">${entry.vetoed ? "Policy-adjusted" : "Direct output"}</span>
                    ${entry.reviewStatus ? renderDecisionReviewTag(entry.reviewStatus) : ""}
                    <span class="tag">${formatEnumLabel(entry.outcomeState || "open")}</span>
                    <span class="tag">${formatSignedReturn(entry.returnSinceDecision)}</span>
                    <span class="tag">${formatShortId(entry.runId)}</span>
                  </div>
                </article>
              `
              )
              .join("")}
          </div>
        </div>
        <div>
          <div class="section-header">
            <div>
              <span class="eyebrow">Eval history</span>
              <h3>Regression runs for prompt and policy changes</h3>
            </div>
          </div>
          <div class="operator-list">
            ${evaluation.history
              .map(
                (run) => `
                <button class="replay-button ${state.selectedEvalId === run.id ? "is-active" : ""}" data-select-eval="${run.id}">
                  <strong>${formatShortId(run.id)}</strong>
                  <span>${formatGeneratedAt(run.generatedAt)}</span>
                  <p>${run.promptVersion} · ${formatScorePercent(run.summary.averageScore)} average · ${run.summary.exactMatchCount}/${run.summary.caseCount} exact</p>
                </button>
              `
              )
              .join("")}
          </div>
          ${
            state.evalDetailError
              ? `
                <article class="status-inline status-inline-error">
                  <strong>Eval detail error</strong>
                  <p>${state.evalDetailError}</p>
                </article>
              `
              : ""
          }
          ${
            state.isEvalDetailLoading
              ? `
                <article class="status-inline">
                  <strong>Loading eval detail</strong>
                  <p>Pulling the stored eval run for ${state.selectedEvalId || "the selected run"}.</p>
                </article>
              `
              : selectedEval
                ? `
                  <div class="context-grid">
                    <article class="context-item">
                      <span>Suite</span>
                      <strong>${selectedEval.suiteName}</strong>
                    </article>
                    <article class="context-item">
                      <span>Prompt version</span>
                      <strong>${selectedEval.promptVersion}</strong>
                    </article>
                    <article class="context-item">
                      <span>Average score</span>
                      <strong>${formatScorePercent(selectedEval.summary.averageScore)}</strong>
                    </article>
                    <article class="context-item">
                      <span>Exact match rate</span>
                      <strong>${formatScorePercent(selectedEval.summary.exactMatchRate)}</strong>
                    </article>
                    <article class="context-item">
                      <span>Scenario pass rate</span>
                      <strong>${formatScorePercent(selectedEval.summary.scenarioExactMatchRate || 0)}</strong>
                    </article>
                    <article class="context-item">
                      <span>Extractor mode</span>
                      <strong>${getEvalMode(selectedEval)}</strong>
                    </article>
                    <article class="context-item">
                      <span>Validation mode</span>
                      <strong>${formatEnumLabel(selectedEval.validationMode || "heuristic-baseline")}</strong>
                    </article>
                    <article class="context-item">
                      <span>Delta vs previous</span>
                      <strong>${selectedEval.summary.deltaVsPreviousAverageScore == null ? "Baseline run" : `${selectedEval.summary.deltaVsPreviousAverageScore > 0 ? "+" : ""}${Math.round(selectedEval.summary.deltaVsPreviousAverageScore * 100)} pts`}</strong>
                    </article>
                    <article class="context-item">
                      <span>Gate</span>
                      <strong>${selectedEval.gate?.passed === false ? "Failed" : "Passed"}</strong>
                    </article>
                  </div>
                  <div class="context-grid">
                    ${perFieldAccuracy
                      .map(
                        ([field, accuracy]) => `
                        <article class="context-item">
                          <span>${formatContextLabel(field)}</span>
                          <strong>${formatScorePercent(accuracy)}</strong>
                        </article>
                      `
                      )
                      .join("")}
                  </div>
                  ${
                    selectedScenarioCases.length
                      ? `
                        <div class="operator-list">
                          ${selectedScenarioCases
                            .map(
                              (testCase) => `
                              <article class="operator-card">
                                <div class="operator-card-head">
                                  <div>
                                    <strong>${testCase.label}</strong>
                                    <span>${formatScorePercent(testCase.score)}</span>
                                  </div>
                                  <span class="pill pill-muted">${testCase.matched ? "Scenario pass" : "Scenario miss"}</span>
                                </div>
                                <p>Misses: ${testCase.fields.filter((field) => !field.matched).map((field) => field.field).join(", ") || "None"}</p>
                              </article>
                            `
                            )
                            .join("")}
                        </div>
                      `
                      : ""
                  }
                  ${
                    selectedEval.failedCases.length
                      ? `
                        <div class="operator-list">
                          ${selectedEval.failedCases
                            .map(
                              (testCase) => `
                              <article class="operator-card">
                                <div class="operator-card-head">
                                  <div>
                                    <strong>${testCase.label}</strong>
                                    <span>${testCase.id}</span>
                                  </div>
                                  <span class="pill pill-muted">${formatScorePercent(testCase.score)}</span>
                                </div>
                                <p>Missed fields: ${testCase.misses.join(", ")}</p>
                              </article>
                            `
                            )
                            .join("")}
                        </div>
                      `
                      : `
                        <article class="status-inline">
                          <strong>All eval cases passed</strong>
                          <p>This run currently matches the stored suite expectations for every case.</p>
                        </article>
                      `
                  }
                  <details>
                    <summary>Eval summary JSON</summary>
                    ${renderJsonBlock(selectedEval.summary)}
                  </details>
                `
                : `
                  <article class="status-inline">
                    <strong>Select an eval run</strong>
                    <p>Pick a stored eval run to inspect prompt-versioned scores and field-level accuracy.</p>
                  </article>
                `
          }
        </div>
      </section>
      <section class="section-card split-card">
        <div>
          <div class="section-header">
            <div>
              <span class="eyebrow">Outcome analytics</span>
              <h3>Asset leaderboard across stored decisions</h3>
            </div>
          </div>
          <div class="feed-list">
            ${historyAnalytics.assetRows
              .slice(0, 6)
              .map(
                (row) => `
                <article class="feed-item">
                  <div class="feed-head">
                    <strong>${row.asset}</strong>
                    <span>${formatSignedReturn(row.averageDirectionalReturn)}</span>
                  </div>
                  <p>${row.count} stored decisions · ${formatScorePercent(row.averageConfidence || 0)} avg confidence · ${formatScorePercent(row.winRate || 0)} stable/favorable rate.</p>
                </article>
              `
              )
              .join("")}
          </div>
        </div>
        <div>
          <div class="section-header">
            <div>
              <span class="eyebrow">Mix</span>
              <h3>Action and outcome distribution</h3>
            </div>
          </div>
          <div class="timeline-list">
            ${actionBreakdown
              .map(
                ([action, count]) => `
                <article class="timeline-item">
                  <span class="timeline-step">${action}</span>
                  <div>
                    <strong>${count} decisions</strong>
                    <p>${action} appears ${count} times in the current decision history.</p>
                  </div>
                </article>
              `
              )
              .join("")}
            ${outcomeBreakdown
              .map(
                ([outcome, count]) => `
                <article class="timeline-item">
                  <span class="timeline-step">${String(count).padStart(2, "0")}</span>
                  <div>
                    <strong>${formatEnumLabel(outcome)}</strong>
                    <p>${count} stored decisions currently sit in this outcome state.</p>
                  </div>
                </article>
              `
              )
              .join("")}
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderContent() {
  if (state.isLoading && !hasRenderableData()) {
    return renderLoading();
  }

  if (state.error && !hasRenderableData()) {
    return renderEmptyState(
      "The local API snapshot could not be loaded.",
      "Start the local server and retry. The frontend now depends on /api/app-data rather than importing hardcoded data directly."
    );
  }

  if (state.view === "assets") {
    return renderAssetsView();
  }

  if (state.view === "research") {
    return renderResearchView();
  }

  if (state.view === "setup") {
    return renderSetupPage();
  }

  if (state.view === "signals") {
    return renderSignalsPage();
  }

  if (state.view === "decisions") {
    return renderDecisionsPage();
  }

  if (state.view === "tests") {
    return renderTestsPage();
  }

  if (state.view === "advisor") {
    return renderAdvisorView();
  }

  if (state.view === "admin") {
    return renderAdminPage();
  }

  if (state.view === "docs") {
    return renderDocsPage();
  }

  if (state.view === "sources") {
    return renderSourceCards();
  }

  if (state.view === "logs") {
    return renderLogs();
  }

  return renderDashboard();
}

function render() {
  app.innerHTML = `
    <div class="page-shell">
      ${renderNav()}
      ${renderContent()}
    </div>
  `;

  attachListeners();
}

render();
loadData();
