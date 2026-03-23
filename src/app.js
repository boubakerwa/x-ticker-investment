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
      newestPostAt: "",
      oldestPostAt: ""
    },
    stages: [],
    notes: []
  },
  runtime: {
    scheduler: {
      active: false,
      running: false,
      intervalMinutes: 0,
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

const state = {
  view: "dashboard",
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
  isRunDetailLoading: false,
  isEvalDetailLoading: false,
  error: "",
  replayError: "",
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
  selectedRunDetail: null,
  selectedEvalDetail: null,
  advisorAnswer: null,
  storeStatus: EMPTY_STORE_STATUS
};

const app = document.querySelector("#app");
const actionFilters = ["ALL", "BUY", "HOLD", "SELL"];
const ADVANCED_VIEWS = ["admin", "assets", "sources", "logs", "docs"];
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

const getData = () => state.data || EMPTY_DATA;
const getStoreStatus = () => state.storeStatus || EMPTY_STORE_STATUS;
const getEngine = () => getData().engine || EMPTY_DATA.engine;
const getHistory = () => getData().history || EMPTY_DATA.history;
const getEvaluation = () => getData().evaluation || EMPTY_DATA.evaluation;
const getResearch = () => getData().research || EMPTY_DATA.research;
const getReviews = () => getData().reviews || EMPTY_DATA.reviews;
const getAdvisor = () => getData().advisor || EMPTY_DATA.advisor;
const getRuntime = () => getData().runtime || EMPTY_DATA.runtime;
const isAdvancedView = (view = state.view) => ADVANCED_VIEWS.includes(view);
const getPrimaryView = (view = state.view) => (isAdvancedView(view) ? "workspace" : view);
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

function getTrackedAssets(profile = getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile) {
  const trackedTickers = getTrackedAssetTickers(profile);

  return trackedTickers.map((ticker) => {
    const universeAsset = getData().monitoredUniverse.find((asset) => asset.ticker === ticker) || null;
    const holding = (profile.holdings || []).find((item) => normalizeTicker(item.ticker) === ticker) || null;
    const decision = getDecisionByAsset(ticker) || null;
    const relatedPosts = sortPostsByCreatedAt(
      getData().posts.filter((post) => (post.mappedAssets || []).includes(ticker))
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
                <button class="mini-chip" data-view="research">Open research</button>
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
              <button class="mini-chip" data-view="research">Open research</button>
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
        <button class="mini-chip" type="button" data-view="assets">Open assets</button>
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
    ? `<button class="mini-chip" type="button" data-view="research">Open research</button>`
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
  const { monitoredUniverse, sources } = getData();

  if (!monitoredUniverse.some((asset) => asset.ticker === state.selectedAsset)) {
    state.selectedAsset = monitoredUniverse[0]?.ticker || "";
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
      throw new Error(`Snapshot request failed with ${snapshotResponse.status}`);
    }

    if (!tweetsResponse.ok) {
      throw new Error(`Tweet feed request failed with ${tweetsResponse.status}`);
    }

    if (!statusResponse.ok) {
      throw new Error(`Store status request failed with ${statusResponse.status}`);
    }

    state.data = await snapshotResponse.json();
    state.recentTweets = (await tweetsResponse.json()).posts || [];
    state.storeStatus = await statusResponse.json();
    syncProfileDraft(getAdvisor().financialProfile || EMPTY_DATA.advisor.financialProfile);
    normalizeSelections();
    normalizeReplaySelection();
    normalizeHistorySelections();

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
    await task();
    state.operatorNotice = successMessage;
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
  }, editingSource ? "Source updated." : "Source created.");
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
  }, "Source deleted.");
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
          <h2>Pulling the latest local brief.</h2>
          <p>The app is waiting for the stored feed, the latest pipeline snapshot, and your saved profile context.</p>
        </div>
        <div class="hero-decision">
          <span class="pill pill-muted">Engine mode</span>
          <strong>Request in flight</strong>
          <p>Once the snapshot lands, the brief, setup flow, advisor, and workspace will all hydrate automatically.</p>
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
  const researchDossiers = getResearchDossiers();
  const trackedAssets = buildTrackedPortfolioAnalytics(profile).trackedAssets.length;
  const primaryItems = [
    ["dashboard", "Overview", trackedAssets || "0"],
    ["setup", "Portfolio", `${profile.holdings.length} holdings`],
    ["research", "Research", `${researchSummary.dossierCount || researchDossiers.length} dossiers`],
    ["signals", "Signals", `${getRecentAnalysedPosts().length} posts`],
    ["advisor", "Advisor", getAdvisor().history.length || "0"],
    [isAdvancedView() ? state.view : "admin", "Operations", getHistory().runs.length || "0"]
  ];
  const activePrimary = state.view === "signals" ? "signals" : getPrimaryView();

  return `
    <header class="office-header">
      <div class="office-titlebar">
        <div>
          <p class="brand-kicker">Local investment desk</p>
          <h1>X Ticker Investment</h1>
        </div>
        <div class="office-meta">
          <div class="office-meta-item">
            <span>Updated</span>
            <strong>${formatGeneratedAt(metadata.generatedAt)}</strong>
          </div>
          <div class="office-meta-item">
            <span>Feed</span>
            <strong>${formatEnumLabel(feedMode)}</strong>
          </div>
          <div class="office-meta-item">
            <span>Setup</span>
            <strong>${setupState.completedCount}/4</strong>
          </div>
          <button class="refresh-button office-refresh" data-refresh>
            ${state.isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
      <div class="office-tabs">
        ${primaryItems
          .map(
            ([view, label, value]) => `
            <button class="office-tab ${activePrimary === (label === "Operations" ? "workspace" : view) || (label === "Operations" && isAdvancedView()) ? "is-active" : ""}" data-view="${view}">
              <span>${label}</span>
              <small>${value}</small>
            </button>
          `
          )
          .join("")}
      </div>
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
            <small>${runtime.scheduler.active ? `${runtime.scheduler.intervalMinutes} min` : "Manual only"}</small>
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
                    </div>
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
                    ${post.mappedAssets.map((asset) => `<button class="tag tag-button" data-asset="${asset}">${asset}</button>`).join("")}
                  </div>
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
                          <span class="tag">${formatPercent(post.confidence)}</span>
                        </div>
                        <div class="tweet-analysis">
                          <div class="tweet-analysis-block">
                            <span>Cluster</span>
                            <strong>${cluster?.title || "Awaiting clustering"}</strong>
                          </div>
                          <div class="tweet-analysis-block">
                            <span>Mapped assets</span>
                            <div class="chip-row">
                              ${post.mappedAssets
                                .map((asset) => `<button class="mini-chip" data-asset="${asset}">${asset}</button>`)
                                .join("")}
                            </div>
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
  const { trackedAssets, actionableAssets, urgentAssets, priorityAssets } = buildTrackedPortfolioAnalytics(profile);
  const recentSignals = sortPostsByCreatedAt(
    getData().posts.filter((post) =>
      (post.mappedAssets || []).some((asset) => trackedTickers.includes(asset))
    )
  ).slice(0, 3);
  const globalFocusItems = getData().decisions.slice(0, 4).map((decision) => ({
    ticker: decision.asset,
    asset: getData().monitoredUniverse.find((item) => item.ticker === decision.asset) || null,
    holding: null,
    decision,
    relatedPosts: sortPostsByCreatedAt(
      getData().posts.filter((post) => (post.mappedAssets || []).includes(decision.asset))
    ).slice(0, 2)
  }));
  const focusItems = (priorityAssets.length ? priorityAssets : globalFocusItems).slice(0, 4);
  const reviewSummary = getReviewSummary();
  const researchSummary = getResearchSummary();
  const researchDossiers = getResearchDossiers();
  const researchCandidateCount =
    researchSummary.candidateCount || researchDossiers.filter((dossier) => normalizeResearchStatus(dossier?.status || dossier?.stage) === "candidate").length;
  const researchApprovedCount =
    researchSummary.approvedCount || researchDossiers.filter((dossier) => normalizeResearchStatus(dossier?.status || dossier?.stage) === "approved").length;
  const featuredResearch = researchDossiers.find(
    (dossier) => normalizeResearchStatus(dossier?.status || dossier?.stage) === "candidate"
  ) || researchDossiers[0] || null;
  const reviewQueue = getDecisionReviewQueue().slice(0, 4);
  const nextReviewItem = reviewQueue.find((item) => item.reviewStatus === "proposed") || null;
  const fallbackRows = focusItems.length
    ? focusItems
        .map((item) => {
          const decision = item.decision;
          const decisionReview = getCurrentDecisionReview(item.ticker);
          const linkedResearch = getResearchForAsset(item.ticker, decision);
          const description =
            decision?.rationale?.[0] ||
            item.asset?.thesis ||
            "No active recommendation yet.";

          return `
            <tr>
              <td><button class="inline-link" data-asset="${item.ticker}">${item.ticker}</button></td>
              <td>${decision?.action || "WATCH"}</td>
              <td>${decision ? formatPercent(decision.confidence || 0) : "Pending"}</td>
              <td>${item.relatedPosts.length}</td>
              <td>${description}${decision ? renderDecisionMathSummary(getDecisionMath(decision)) : ""}</td>
              <td>${decisionReview && isResearchEligibleForReview(linkedResearch) ? renderDecisionReviewTag(decisionReview.reviewStatus) : `<span class="subtle">${isResearchEligibleForReview(linkedResearch) ? "No review needed" : "Research first"}</span>`}</td>
              <td>${decisionReview ? renderDecisionReviewGate(decisionReview.id, decisionReview.reviewStatus, decision, linkedResearch) : `<span class="subtle">Nothing queued.</span>`}</td>
            </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="7">No focus list yet. Save a watchlist or holdings first.</td>
      </tr>
    `;
  const focusRows = reviewQueue.length
    ? reviewQueue
        .map(
          (item) => `
            <tr>
              <td><button class="inline-link" data-asset="${item.asset}">${item.asset}</button></td>
              <td>${item.action}</td>
              <td>${formatPercent(item.confidence || 0)}</td>
              <td>${item.relatedPostCount}</td>
              <td>${item.summary || "No rationale captured."}${renderDecisionMathSummary(getDecisionMath(item))}</td>
              <td>
                ${renderDecisionReviewTag(item.reviewStatus)}
                ${
                  item.reviewedAt
                    ? `<div class="office-review-meta">${formatGeneratedAt(item.reviewedAt)}</div>`
                    : `<div class="office-review-meta">Pending operator decision</div>`
                }
              </td>
              <td>${renderDecisionReviewGate(item.id, item.reviewStatus, item, item.linkedResearch)}</td>
            </tr>
          `
        )
        .join("")
    : fallbackRows;
  const signalRows = (recentSignals.length ? recentSignals : getRecentAnalysedPosts().slice(0, 3)).length
    ? (recentSignals.length ? recentSignals : getRecentAnalysedPosts().slice(0, 3))
        .map((post) => {
          const source = getSource(post.sourceId);

          return `
            <tr>
              <td>${source?.handle || post.sourceId}</td>
              <td>${formatGeneratedAt(post.createdAt)}</td>
              <td>${(post.mappedAssets || []).join(", ") || "Unmapped"}</td>
              <td>${post.body}</td>
            </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="4">No recent signals yet. Import manual posts in the Signals tab to move beyond the demo feed.</td>
      </tr>
    `;
  const nextAction =
    !setupState.hasDecisionFrame || !setupState.hasPortfolioContext
      ? "Complete the Portfolio tab so the brief can focus on your real positions."
      : !researchSummary.dossierCount && !researchDossiers.length && getData().decisions.length
        ? "Capture a research dossier before treating any fresh decision as actionable."
      : researchSummary.dossierCount || researchDossiers.length
        ? `Review ${escapeHtml(getResearchDossierHeadline(featuredResearch, "the lead research dossier"))} before approving the queue.`
        : reviewSummary.proposedCount
          ? `Approve or dismiss ${nextReviewItem?.asset || "the top queued decision"} first.`
          : !setupState.hasRealSignalInput
            ? "Use the Signals tab to import a few real posts before trusting the queue."
            : urgentAssets.length
              ? `Review ${urgentAssets[0]?.ticker || "the first urgent asset"} first.`
              : "The setup is usable. Check the queue and ask targeted questions in Advisor.";

  return `
    <main class="office-content">
      ${renderStatusBanner()}
      ${renderOperatorNotice()}
      <section class="office-panel office-summary-panel">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Overview</span>
            <h2>${trackedAssets.length ? "Daily review queue" : "Setup still needs input"}</h2>
          </div>
        </div>
        <div class="office-summary-grid">
          <article class="office-metric">
            <span>Portfolio coverage</span>
            <strong>${trackedAssets.length}</strong>
            <small>${profile.holdings.length} holdings and ${(profile.watchlist || []).length} watchlist names</small>
          </article>
          <article class="office-metric">
            <span>Feed status</span>
            <strong>${formatEnumLabel(feedMode)}</strong>
            <small>${getRecentAnalysedPosts().length} recent posts in scope</small>
          </article>
          <article class="office-metric">
            <span>Pending approvals</span>
            <strong>${reviewSummary.proposedCount}</strong>
            <small>${reviewSummary.reviewedCount} reviewed and ${getData().decisions.length} total decisions</small>
          </article>
          <article class="office-metric">
            <span>Safety buffer</span>
            <strong>${cashSummary.emergencyCoverageMonths ? `${cashSummary.emergencyCoverageMonths}m` : "Pending"}</strong>
            <small>${cashSummary.monthlyBurn > 0 ? `${formatCurrency(cashSummary.monthlyBurn)} monthly burn gap` : "Cash flow neutral or positive"}</small>
          </article>
        </div>
        <div class="office-next-step">
          <span>Next action</span>
          <strong>${nextAction}</strong>
        </div>
        <div class="office-research-callout">
          <div>
            <span class="eyebrow">Research before approval</span>
            <h3>${featuredResearch ? escapeHtml(getResearchDossierHeadline(featuredResearch)) : "No research dossiers yet"}</h3>
            <p>${featuredResearch ? escapeHtml(featuredResearch.thesis || featuredResearch.summary || "Inspect the thesis packet before the candidate gets promoted.") : "When the app-data payload exposes a research block, the lead dossier will appear here."}</p>
          </div>
          <div class="office-research-callout-meta">
            ${featuredResearch ? renderLifecyclePill(featuredResearch.status || featuredResearch.stage) : `<span class="pill pill-muted">Discovery</span>`}
            <span class="pill pill-muted">${researchSummary.dossierCount || researchDossiers.length} dossiers</span>
            <span class="pill pill-muted">${researchApprovedCount} approved</span>
          </div>
          <button class="mini-chip" data-view="research">Open research</button>
        </div>
      </section>
      <section class="office-panel">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Research intake</span>
            <h3>Evidence chain before the queue</h3>
          </div>
          <button class="mini-chip" data-view="research">Open research view</button>
        </div>
        <div class="research-dashboard-grid">
          <article class="research-dashboard-card">
            <span>Candidate packets</span>
            <strong>${researchCandidateCount}</strong>
            <p>Theses waiting for a human decision or deeper validation.</p>
          </article>
          <article class="research-dashboard-card">
            <span>Approved packets</span>
            <strong>${researchApprovedCount}</strong>
            <p>Evidence already cleared to shape recommendations downstream.</p>
          </article>
          <article class="research-dashboard-card">
            <span>Quality / timeliness</span>
            <strong>${formatDecisionMathValue(researchSummary.averageSourceQualityScore, { probability: true })}</strong>
            <p>${researchSummary.averageTimelinessScore != null ? `Timeliness ${formatDecisionMathValue(researchSummary.averageTimelinessScore, { probability: true })}` : "Timeliness pending from the research block."}</p>
          </article>
          <article class="research-dashboard-card">
            <span>Lifecycle focus</span>
            <strong>${featuredResearch ? renderLifecyclePill(featuredResearch.status || featuredResearch.stage) : "Discovery"}</strong>
            <p>${featuredResearch ? escapeHtml(featuredResearch.summary || featuredResearch.thesis || "Start with the lead thesis packet.") : "Research, then candidate review, then approval."}</p>
          </article>
        </div>
      </section>
      <section class="office-grid office-grid-two">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Approval queue</span>
              <h3>What to approve or dismiss first</h3>
            </div>
            <button class="mini-chip" data-view="advisor">Open advisor</button>
          </div>
          <table class="office-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Action</th>
                <th>Confidence</th>
                <th>Posts</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>${focusRows}</tbody>
          </table>
        </section>
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Recent signals</span>
              <h3>Latest posts touching the queue</h3>
            </div>
            <button class="mini-chip" data-view="signals">Open signals</button>
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
            <tbody>${signalRows}</tbody>
          </table>
        </section>
      </section>
      <section class="office-grid office-grid-two">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Setup status</span>
              <h3>Essentials checklist</h3>
            </div>
            <button class="mini-chip" data-view="setup">Open portfolio</button>
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
              <span class="eyebrow">Latest advisor output</span>
              <h3>${latestAnswer ? latestAnswer.answer.headline : "No advisor answer yet"}</h3>
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
              : `<p>Use the Advisor tab for focused questions once the portfolio and signal input are in place.</p>`
          }
        </section>
      </section>
    </main>
  `;
}

function renderAssetDecision(asset, decision) {
  if (!decision) {
    return `
      <article class="section-card nested-card">
        <span class="eyebrow">Decision summary</span>
        <h3>No active recommendation for ${asset.ticker}</h3>
        <p>This asset is in the curated universe, but the current snapshot did not generate a live BUY, HOLD, or SELL call.</p>
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
          <button class="mini-chip" data-view="dashboard">Back to overview</button>
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
                : `<button class="mini-chip" data-view="signals">Open signals</button>`
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
              <button class="mini-chip" type="button" data-view="dashboard">Back to overview</button>
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
            <button class="mini-chip" data-view="signals">Open signals</button>
            <button class="mini-chip" data-view="assets">Open assets</button>
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
  const { monitoredUniverse } = getData();
  const asset = monitoredUniverse.find((item) => item.ticker === state.selectedAsset);

  if (!asset) {
    return renderEmptyState(
      "The tradable universe has not loaded yet.",
      "Once the API responds, the focused AI, tech, ETF, and crypto list will appear here."
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
              <span class="eyebrow">Tradable universe</span>
              <h3>Focused tech, AI, and crypto list</h3>
            </div>
          </div>
          <div class="asset-list">
            ${monitoredUniverse
              .map((item) => {
                const itemDecision = getDecisionByAsset(item.ticker);
                return `
                  <button class="asset-item ${state.selectedAsset === item.ticker ? "is-selected" : ""}" data-asset="${item.ticker}">
                    <div>
                      <strong>${item.ticker}</strong>
                      <span>${item.bucket}</span>
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
              <span class="eyebrow">${asset.type}</span>
              <h2>${asset.name} <span class="muted">${asset.ticker}</span></h2>
              <p>${asset.thesis}</p>
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
                                <button class="mini-chip" data-view="research">Open research</button>
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
  const currentStep = Math.min(state.profileOnboardingStep || 0, 2);
  const onboardingPanels = [
    `
      <section class="office-form-section">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Profile basics</span>
            <h3>Investor profile and watchlist</h3>
            <p class="section-copy">Keep this short. The app only needs enough context to interpret your signals and holdings correctly.</p>
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
            <input name="investmentHorizon" value="${escapeHtml(profile.investmentHorizon || "")}" placeholder="e.g. 10+ years, 3 years, liquidity reserve" />
          </label>
          <label class="form-field">
            <span>Liquidity needs</span>
            <input name="liquidityNeeds" value="${escapeHtml(profile.liquidityNeeds || "")}" placeholder="Low, medium, high" />
          </label>
        </div>
        <label class="form-field">
          <span>Goals (comma separated)</span>
          <input
            name="goals"
            value="${escapeHtml((profile.goals || []).join(", "))}"
            placeholder="Retirement, preserve liquidity, home purchase, education"
          />
        </label>
        <label class="form-field">
          <span>Watchlist tickers (comma separated)</span>
          <input
            name="watchlist"
            value="${escapeHtml((profile.watchlist || []).join(", "))}"
            placeholder="NVDA, BTC, VWCE, MSFT"
          />
        </label>
        <label class="form-field">
          <span>Notes</span>
          <textarea name="notes" rows="4" placeholder="Anything the advisor should keep in mind about concentration, liquidity, or personal constraints.">${escapeHtml(profile.notes || "")}</textarea>
        </label>
        <div class="office-inline-stats">
          <article class="context-item">
            <span>Watchlist names</span>
            <strong>${(profile.watchlist || []).length}</strong>
          </article>
          <article class="context-item">
            <span>Tracked assets</span>
            <strong>${onboardingSummary.trackedAssetCount}</strong>
          </article>
        </div>
      </section>
    `,
    `
      <section class="office-form-section">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Cash and cover</span>
            <h3>Safety buffer, liabilities, and long-term products</h3>
            <p class="section-copy">Add the fixed things that shape your real risk capacity: monthly cash flow, debt, private pensions, and insurance wrappers.</p>
          </div>
        </div>
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
        <div class="office-inline-stats">
          <article class="context-item">
            <span>Monthly free cash flow</span>
            <strong>${formatCurrency((profile.monthlyNetIncome || 0) - (profile.monthlyExpenses || 0))}</strong>
          </article>
          <article class="context-item">
            <span>Current reserve</span>
            <strong>${formatCurrency(profile.emergencyFund || 0)}</strong>
          </article>
        </div>
        ${renderProfileCollectionSection({
          collection: "retirementProducts",
          title: "Insurance and pensions",
          copy: "Private Rentenversicherung, bAV, insurance wrappers, and other long-term products",
          addLabel: "Add product",
          emptyCopy: "Add anything that should count as part of your long-term financial picture, even if it is not a tradable holding.",
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
              options: [
                "Private Rentenversicherung",
                "bAV",
                "Life insurance",
                "Disability insurance",
                "Health insurance",
                "Other"
              ]
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
              placeholder: "Optional details like guarantees, surrender limits, or tax treatment"
            }
          ]
        })}
        ${renderProfileCollectionSection({
          collection: "liabilities",
          title: "Liabilities",
          copy: "Loans, mortgages, recurring premiums, and other obligations",
          addLabel: "Add liability",
          emptyCopy: "Add mortgages, personal loans, or other liabilities that materially affect your monthly flexibility.",
          fields: [
            {
              key: "label",
              label: "Name",
              placeholder: "Apartment mortgage, KfW loan, premium finance"
            },
            {
              key: "category",
              label: "Category",
              type: "select",
              options: [
                "Mortgage",
                "Personal loan",
                "Credit line",
                "Insurance premium",
                "Tax due",
                "Other"
              ]
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
              placeholder: "Optional details like fixed-rate end date, lender, or policy schedule"
            }
          ]
        })}
      </section>
    `,
    `
      <section class="office-form-section">
        <div class="office-panel-head">
          <div>
            <span class="eyebrow">Assets</span>
            <h3>Holdings you actually own</h3>
            <p class="section-copy">Add positions one by one. Include ETFs, stocks, crypto, or even a cash sleeve if you want the brief to reflect it.</p>
          </div>
        </div>
        <div class="office-inline-stats">
          <article class="context-item">
            <span>Holdings count</span>
            <strong>${profile.holdings.length}</strong>
          </article>
          <article class="context-item">
            <span>Holdings value</span>
            <strong>${formatCurrency(onboardingSummary.holdingsTotal)}</strong>
          </article>
        </div>
        ${renderProfileCollectionSection({
          collection: "holdings",
          title: "Holdings",
          copy: "Securities, ETFs, crypto, and cash sleeves",
          addLabel: "Add holding",
          emptyCopy: "Start with a few real positions. You do not need a perfect export for the app to become useful.",
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
              placeholder: "Optional context like core position, long-term sleeve, or concentration note"
            }
          ]
        })}
      </section>
    `
  ];

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
      <section class="office-grid office-grid-sidebar">
        <section class="office-panel">
          <div class="office-panel-head">
            <div>
              <span class="eyebrow">Portfolio</span>
              <h2>Portfolio setup</h2>
            </div>
          </div>
          <form class="operator-form office-form" data-profile-form>
            ${renderOnboardingStepCards(currentStep)}
            ${onboardingPanels[currentStep] || onboardingPanels[0]}
            <div class="office-form-actions">
              <button class="mini-chip" type="button" data-onboarding-prev ${currentStep === 0 ? "disabled" : ""}>Previous</button>
              <button class="mini-chip" type="button" data-onboarding-next ${currentStep === onboardingPanels.length - 1 ? "disabled" : ""}>Next</button>
              <button class="refresh-button" type="submit" ${state.isSavingProfile ? "disabled" : ""}>
                ${state.isSavingProfile ? "Saving..." : "Save portfolio"}
              </button>
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
            <p>Go to the Signals tab, import a few real posts, run the pipeline, then return to Overview for the review queue.</p>
            <div class="office-form-actions">
              <button class="mini-chip" data-view="signals">Open signals</button>
              <button class="mini-chip" data-view="dashboard">Back to overview</button>
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
            <span class="eyebrow">Signals</span>
            <h2>Feed input and latest imports</h2>
          </div>
          <div class="office-form-actions">
            <button class="mini-chip" type="button" data-run-pipeline ${state.isRunningPipeline ? "disabled" : ""}>
              ${state.isRunningPipeline ? "Running..." : "Run pipeline"}
            </button>
            <button class="mini-chip" data-view="dashboard">Back to overview</button>
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
              <span class="eyebrow">Manual import</span>
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
              <span class="eyebrow">Store breakdown</span>
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
            <span class="eyebrow">Latest analysed posts</span>
            <h3>Current feed window</h3>
          </div>
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
                          <td>${(post.mappedAssets || []).join(", ") || "Unmapped"}</td>
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
  const { monitoredUniverse } = getData();
  const advisor = getAdvisor();
  const profile = advisor.financialProfile || EMPTY_DATA.advisor.financialProfile;
  const latestAnswer = getLatestAdvisorAnswer();
  const setupState = buildSingleUserSetupState(profile);
  const trackedTickers = getTrackedAssetTickers(profile);
  const suggestedTickers = trackedTickers.length
    ? trackedTickers
    : monitoredUniverse.slice(0, 6).map((asset) => asset.ticker);
  const relatedSignals = sortPostsByCreatedAt(
    getData().posts.filter((post) => (post.mappedAssets || []).some((asset) => suggestedTickers.includes(asset)))
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
                ${monitoredUniverse
                  .map(
                    (asset) => `
                    <option value="${asset.ticker}">${asset.name}</option>
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
                          <td>${(post.mappedAssets || []).join(", ") || "Unmapped"}</td>
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

  if (!source) {
    return renderEmptyState(
      "The source registry is still loading.",
      "Once the snapshot arrives, different account categories and handling rules will appear here."
    );
  }

  const sourcePosts = getPostsForSource(source.id);

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
              .map(
                (item) => `
                <button class="source-item ${state.selectedSource === item.id ? "is-selected" : ""}" data-source="${item.id}">
                  <div>
                    <strong>${item.handle}</strong>
                    <span>${item.category}</span>
                  </div>
                  <small>${formatPercent(item.baselineReliability)}</small>
                </button>
              `
              )
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
              <strong>${formatPercent(source.baselineReliability)}</strong>
              <span>${source.tone}</span>
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
                        ${post.mappedAssets.map((assetCode) => `<button class="tag tag-button" data-asset="${assetCode}">${assetCode}</button>`).join("")}
                      </div>
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
          <p>${latestEval ? `${latestEval.summary.exactMatchCount}/${latestEval.summary.caseCount} exact matches using ${latestEval.extractor.activeMode}, plus ${latestEval.summary.scenarioExactMatchCount || 0}/${latestEval.summary.scenarioCaseCount || 0} scenario passes.` : "Run the eval harness from Operator to populate regression history."}</p>
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
                      <strong>${selectedEval.extractor.activeMode}</strong>
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
