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
const getAdvisor = () => getData().advisor || EMPTY_DATA.advisor;
const getRuntime = () => getData().runtime || EMPTY_DATA.runtime;
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

function parseDelimitedGrid(rawValue, delimiter) {
  return String(rawValue || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(delimiter).map((item) => item.trim()));
}

function parseLooseNumber(value) {
  const normalizedValue = String(value || "")
    .replace(/[€$£,\s]/g, "")
    .trim();
  const numericValue = Number(normalizedValue);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function detectTabularDelimiter(sampleLine) {
  if ((sampleLine.match(/\t/g) || []).length > 0) {
    return "\t";
  }

  if ((sampleLine.match(/;/g) || []).length > 0) {
    return ";";
  }

  return ",";
}

function parseHoldingsImport(rawValue) {
  const trimmedValue = String(rawValue || "").trim();

  if (!trimmedValue) {
    return [];
  }

  const lines = trimmedValue.split("\n").map((line) => line.trim()).filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const delimiter = detectTabularDelimiter(lines[0]);
  const rows = parseDelimitedGrid(trimmedValue, delimiter);
  const header = rows[0].map((value) => value.toLowerCase().replace(/[^a-z]+/g, ""));
  const hasHeader = header.some((value) =>
    ["ticker", "symbol", "value", "currentvalue", "account", "costbasis", "notes"].includes(value)
  );
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map((parts) => {
      if (!parts.length) {
        return null;
      }

      if (!hasHeader) {
        return {
          ticker: normalizeTicker(parts[0]),
          category: parts[1] || "Imported holding",
          currentValue: parseLooseNumber(parts[2]),
          costBasis: parseLooseNumber(parts[3]),
          accountType: parts[4] || "Brokerage",
          notes: parts[5] || ""
        };
      }

      const row = {};

      header.forEach((key, index) => {
        row[key] = parts[index] || "";
      });

      return {
        ticker: normalizeTicker(row.ticker || row.symbol || row.asset || row.security),
        category: row.category || row.assettype || row.type || "Imported holding",
        currentValue: parseLooseNumber(row.currentvalue || row.value || row.marketvalue),
        costBasis: parseLooseNumber(row.costbasis || row.avgcost || row.bookvalue),
        accountType: row.account || row.accounttype || row.wrapper || "Brokerage",
        notes: row.notes || row.comment || row.name || ""
      };
    })
    .filter((item) => item && item.ticker);
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

function getLatestAdvisorAnswer() {
  return state.advisorAnswer || getAdvisor().history[0] || null;
}

function serializeHoldings(holdings) {
  return (holdings || [])
    .map(
      (holding) =>
        [
          holding.ticker || "",
          holding.category || "",
          holding.currentValue ?? "",
          holding.costBasis ?? "",
          holding.accountType || "",
          holding.notes || ""
        ].join("|")
    )
    .join("\n");
}

function serializeLiabilities(liabilities) {
  return (liabilities || [])
    .map(
      (liability) =>
        [
          liability.label || "",
          liability.category || "",
          liability.balance ?? "",
          liability.interestRate ?? "",
          liability.monthlyPayment ?? "",
          liability.notes || ""
        ].join("|")
    )
    .join("\n");
}

function serializeRetirementProducts(retirementProducts) {
  return (retirementProducts || [])
    .map(
      (product) =>
        [
          product.label || "",
          product.type || "",
          product.provider || "",
          product.currentValue ?? "",
          product.monthlyContribution ?? "",
          product.notes || ""
        ].join("|")
    )
    .join("\n");
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

function setProfileOnboardingStep(nextStep) {
  state.profileOnboardingStep = Math.max(0, Math.min(5, Number(nextStep) || 0));
}

function hydrateProfileDraftFromForm(form) {
  if (!form) {
    return getProfileDraft();
  }

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

  document.querySelectorAll("[data-import-holdings]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = button.closest("form");
      const importField = form?.querySelector("[name='holdingsImport']");
      const importedHoldings = parseHoldingsImport(importField?.value || "");

      hydrateProfileDraftFromForm(form);

      if (!importedHoldings.length) {
        state.advisorError = "Paste at least one holding row before importing.";
        state.advisorNotice = "";
        render();
        return;
      }

      getProfileDraft().holdings = importedHoldings;
      state.advisorNotice = `Imported ${importedHoldings.length} holdings from the pasted table.`;
      state.advisorError = "";
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
          <h3>Pulling the latest local fake-API snapshot</h3>
          <p>The current UI stays visible while the app reloads the persisted tweet feed and snapshot data.</p>
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
          <h2>Pulling the operator snapshot from the local agent engine.</h2>
          <p>The UI now waits for the persisted tweet feed, the local API, and the server-side claim-to-decision runtime before hydrating.</p>
        </div>
        <div class="hero-decision">
          <span class="pill pill-muted">Engine mode</span>
          <strong>Request in flight</strong>
          <p>Once the snapshot lands, the dashboard, asset pages, source registry, and operator runtime will hydrate automatically.</p>
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
  const { monitoredUniverse, sources } = getData();
  const history = getHistory();
  const items = [
    ["dashboard", "Today"],
    ["advisor", "Advisor"],
    ["admin", "Operator"],
    ["docs", "Docs"],
    ["assets", "Asset View"],
    ["sources", "Source Registry"],
    ["logs", "Run History"]
  ];

  return `
    <nav class="side-nav">
      <div class="brand-block">
        <p class="brand-kicker">X-Ticker Investment</p>
        <h1>Explainable social-signal investing for a narrow AI/tech universe.</h1>
        <p class="brand-copy">
          Bounded agents interpret social signals; deterministic policy and veto layers make the call.
        </p>
      </div>
      <div class="nav-list">
        ${items
          .map(
            ([view, label]) => `
            <button class="nav-button ${state.view === view ? "is-active" : ""}" data-view="${view}">
              <span>${label}</span>
              <small>${view === "dashboard" ? "Live" : view === "advisor" ? (getAdvisor().history.length || "Ask") : view === "admin" ? "Engine" : view === "docs" ? "Guide" : view === "assets" ? monitoredUniverse.length : view === "sources" ? sources.length : history.runs.length || "v1"}</small>
            </button>
          `
          )
          .join("")}
      </div>
      <div class="sidebar-note">
        <span class="pill pill-muted">Execution disabled</span>
        <p>
          v1 stays in decision-support mode, but now persists pipeline runs, eval history, and replayable decision logs.
        </p>
      </div>
    </nav>
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
  const status = getStoreStatus();
  const engine = getEngine();
  const history = getHistory();
  const evaluation = getEvaluation();
  const runtime = getRuntime();
  const { sources, clusters, decisions, vetoedSignals, ingestion, market } = getData();
  const editingSource = getSourceBeingEdited();
  const extractor = engine.extractor || EMPTY_DATA.engine.extractor;
  const latestRun = history.runs[0] || null;
  const latestEval = evaluation.latestRun || evaluation.history[0] || null;
  const bySource = status.bySource
    .map((entry) => {
      const source = getSource(entry.sourceId);
      return `
        <article class="context-item">
          <span>${source?.handle || entry.sourceId}</span>
          <strong>${entry.count} tweets</strong>
        </article>
      `;
    })
    .join("");
  const byCluster = status.byCluster
    .map((entry) => {
      const cluster = getCluster(entry.clusterId);
      return `
        <article class="context-item">
          <span>${cluster?.title || entry.clusterId}</span>
          <strong>${entry.count} analysed posts</strong>
        </article>
      `;
    })
    .join("");
  const ingestionWatermarks = ingestion?.watermarks || [];
  const marketLeaders = market?.assets?.slice(0, 4) || [];
  const notificationConfig = runtime.orchestrator?.notifications?.config || {};
  const manualSourceOptions = sources
    .map(
      (source) => `
        <option value="${escapeHtml(source.id)}">${escapeHtml(source.handle)} · ${escapeHtml(source.name)}</option>
      `
    )
    .join("");

  const heroSection = `
    <section class="hero-panel admin-hero">
        <div>
          <span class="eyebrow">Operator</span>
          <h2>The local feed now runs through a persisted server-side pipeline before it reaches the app.</h2>
          <p>
            Tweets are fetched and append-only in this phase. The pipeline now persists ingestion snapshots, market context, claim extraction output, clusters, decisions, and eval history so the UI can replay runs instead of recomputing everything on every request.
          </p>
        </div>
        <div class="hero-decision">
          <span class="pill pill-muted">${engine.mode || "engine offline"}</span>
          <strong>${engine.summary.claimCount || 0} analysed posts</strong>
          <span>Run at ${formatGeneratedAt(engine.generatedAt || status.seededAt)}</span>
          <p>Extractor: ${extractor.activeMode || status.extractorMode || "heuristic"}${extractor.model ? ` via ${extractor.model}` : ""}. Use the controls below to rerun the pipeline, test notifications, send a daily digest, import a manual feed, or reset back to the fake seed.</p>
          <div class="action-stack">
            <button class="refresh-button" data-run-pipeline>${state.isRunningPipeline ? "Running pipeline..." : "Run pipeline"}</button>
            <button class="refresh-button" data-run-evals>${state.isRunningEvals ? "Running evals..." : "Run eval harness"}</button>
            <button class="refresh-button" data-send-digest>${state.isSendingDigest ? "Sending digest..." : "Send digest"}</button>
            <button class="mini-chip" data-test-notification>${state.isTestingNotification ? "Testing..." : "Test notification"}</button>
            <button class="refresh-button" data-reseed-fake-tweets>${state.isReseeding ? "Reseeding..." : "Reseed 140 fake tweets"}</button>
          </div>
        </div>
      </section>
  `;

  const statSection = `
      <section class="stat-grid">
        <article class="stat-card">
          <span class="eyebrow">Latest run</span>
          <strong>${formatShortId(latestRun?.id || history.latestRunId)}</strong>
          <p>${latestRun ? `${formatEnumLabel(latestRun.trigger)} at ${formatGeneratedAt(latestRun.generatedAt)}` : "Waiting for a persisted pipeline run."}</p>
        </article>
        <article class="stat-card">
          <span class="eyebrow">Market regime</span>
          <strong>${market?.summary?.marketRegime || engine.summary.marketRegime || "Pending"}</strong>
          <p>${market?.summary?.strongestTicker ? `${market.summary.strongestTicker} currently leads the mocked market snapshot.` : "Market context appears after the pipeline runs."}</p>
        </article>
        <article class="stat-card">
          <span class="eyebrow">Eval harness</span>
          <strong>${latestEval ? formatScorePercent(latestEval.summary.averageScore) : "Pending"}</strong>
          <p>${latestEval ? `${latestEval.summary.exactMatchCount}/${latestEval.summary.caseCount} exact matches in ${latestEval.suiteName}.` : "Run the eval harness to populate regression history."}</p>
        </article>
        <article class="stat-card">
          <span class="eyebrow">Ingestion contract</span>
          <strong>${ingestion?.contractVersion || "raw-post-v1"}</strong>
          <p>${ingestion ? `${ingestion.dedupedCount} deduped posts from ${ingestion.sourcesCovered} sources in ${status.mode || "fake-api"} mode.` : "The raw-post and normalized-post contracts appear after the first run."}</p>
        </article>
      </section>
  `;

  const pipelineSection = `
      <section class="section-card split-card">
        <div>
          <div class="section-header">
            <div>
              <span class="eyebrow">Pipeline state</span>
              <h3>Persisted ingestion, extraction, and market summary</h3>
            </div>
          </div>
          <div class="context-grid">
            <article class="context-item">
              <span>Feed mode</span>
              <strong>${status.mode || "fake-api"}</strong>
            </article>
            <article class="context-item">
              <span>Fetched / deduped</span>
              <strong>${ingestion ? `${ingestion.fetchedCount} / ${ingestion.dedupedCount}` : `${status.postCount || 0}`}</strong>
            </article>
            <article class="context-item">
              <span>Duplicates removed</span>
              <strong>${ingestion?.duplicateCount ?? 0}</strong>
            </article>
            <article class="context-item">
              <span>Clusters / decisions</span>
              <strong>${engine.summary.clusterCount || 0} / ${engine.summary.decisionCount || 0}</strong>
            </article>
            <article class="context-item">
              <span>Policy vetoes</span>
              <strong>${engine.summary.vetoCount || 0}</strong>
            </article>
            <article class="context-item">
              <span>Avg 5d returns</span>
              <strong>${market?.summary?.averageReturns5d || "Pending"}</strong>
            </article>
            <article class="context-item">
              <span>Scheduler</span>
              <strong>${runtime.scheduler.active ? `Every ${runtime.scheduler.intervalMinutes}m` : "Disabled"}</strong>
            </article>
            <article class="context-item">
              <span>Next scheduled run</span>
              <strong>${runtime.scheduler.nextRunAt ? formatGeneratedAt(runtime.scheduler.nextRunAt) : "Pending"}</strong>
            </article>
            <article class="context-item">
              <span>Notifications</span>
              <strong>${notificationConfig.activeProvider || "disabled"}</strong>
            </article>
            <article class="context-item">
              <span>Live X status</span>
              <strong>${status.mode === "x-api" ? "Connected" : "Not active"}</strong>
            </article>
          </div>
          <div class="operator-list">
            ${
              ingestionWatermarks.length
                ? ingestionWatermarks
                    .slice(0, 4)
                    .map(
                      (watermark) => `
                      <article class="context-item">
                        <span>${getSource(watermark.sourceId)?.handle || watermark.sourceId}</span>
                        <strong>${formatGeneratedAt(watermark.newestPostAt)}</strong>
                      </article>
                    `
                    )
                    .join("")
                : '<article class="context-item"><span>No source watermarks yet</span><strong>Waiting for ingestion output</strong></article>'
            }
          </div>
        </div>
        <div>
          <div class="section-header">
            <div>
              <span class="eyebrow">Distribution</span>
              <h3>How the current run is shaped across sources and narratives</h3>
            </div>
          </div>
          <div class="context-grid admin-context-grid">
            ${bySource || '<article class="context-item"><span>No source activity</span><strong>Waiting for the feed</strong></article>'}
          </div>
          <div class="context-grid admin-context-grid">
            ${byCluster || '<article class="context-item"><span>No narrative output</span><strong>Waiting for clustering</strong></article>'}
          </div>
          <div class="operator-list">
            ${
              marketLeaders.length
                ? marketLeaders
                    .map(
                      (asset) => `
                      <article class="context-item">
                        <span>${asset.ticker}</span>
                        <strong>${asset.display.returns5d}</strong>
                      </article>
                    `
                    )
                    .join("")
                : '<article class="context-item"><span>No market leaders yet</span><strong>Waiting for market enrichment</strong></article>'
            }
          </div>
        </div>
      </section>
  `;

  const manualInboxSection = `
          <form class="operator-form" data-manual-feed-form>
            <div class="section-header compact">
              <div>
                <span class="eyebrow">Manual inbox</span>
                <h3>Paste real posts, links, or notes and rerun the pipeline</h3>
              </div>
            </div>
            <label class="form-field">
              <span>Use an existing source</span>
              <select name="manualSourceId">
                <option value="">Create or reuse the handle below</option>
                ${manualSourceOptions}
              </select>
            </label>
            <div class="field-grid">
              <label class="form-field">
                <span>Source handle</span>
                <input name="manualSourceHandle" value="@personaldesk" />
              </label>
              <label class="form-field">
                <span>Source name</span>
                <input name="manualSourceName" value="Personal Desk" />
              </label>
              <label class="form-field">
                <span>Source category</span>
                <input name="manualSourceCategory" value="Manual / Single User" />
              </label>
              <label class="form-field">
                <span>Allowed assets (comma separated)</span>
                <input name="manualAllowedAssets" placeholder="NVDA, BTC, QQQ" />
              </label>
            </div>
            <label class="form-field">
              <span>Relevant sectors (comma separated)</span>
              <input name="manualRelevantSectors" placeholder="AI infrastructure, crypto, software" />
            </label>
            <label class="form-field">
              <span>Paste one post per blank line</span>
              <textarea
                name="manualRawText"
                rows="8"
                placeholder="2026-03-22T08:15:00Z | Hyperscaler checks still say AI server pull-ins are holding. Cooling remains the pinch point.&#10;&#10;Export chatter is loud again, but no new language has actually landed. Treat this as noise until a draft appears."
              ></textarea>
              <small>Optional format: start a post with an ISO timestamp, then a pipe character (|), then the post body. Otherwise the app timestamps it when imported.</small>
            </label>
            <label class="checkbox-field">
              <input name="manualReplaceExisting" type="checkbox" checked />
              <span>Replace the current feed instead of appending to it</span>
            </label>
            <div class="operator-actions">
              <button class="refresh-button" type="submit">${state.isMutating ? "Importing..." : "Import manual feed & run pipeline"}</button>
              <button class="mini-chip" type="button" data-reseed-fake-tweets>Reset back to fake feed</button>
            </div>
          </form>
  `;

  const sourceCrudSection = `
          <div class="section-header">
            <div>
              <span class="eyebrow">Source CRUD</span>
              <h3>Create and maintain monitored sources</h3>
            </div>
            <button class="refresh-button" data-new-source>New source</button>
          </div>
          <div class="operator-list">
            ${sources
              .map(
                (source) => `
                <article class="operator-card ${editingSource?.id === source.id ? "is-selected" : ""}">
                  <div class="operator-card-head">
                    <div>
                      <strong>${source.handle}</strong>
                      <span>${source.category}</span>
                    </div>
                    <span class="pill">${formatPercent(source.baselineReliability)}</span>
                  </div>
                  <p>${source.policyTemplate}</p>
                  <div class="operator-actions">
                    <button class="mini-chip" data-edit-source="${source.id}">Edit</button>
                    <button class="mini-chip danger-chip" data-delete-source="${source.id}">Delete</button>
                  </div>
                </article>
              `
              )
              .join("")}
          </div>
          <form class="operator-form" data-source-form>
            <div class="section-header compact">
              <div>
                <span class="eyebrow">${editingSource ? "Edit source" : "Create source"}</span>
                <h3>${editingSource ? editingSource.name : "New monitored source"}</h3>
              </div>
            </div>
            <div class="field-grid">
              <label class="form-field">
                <span>Name</span>
                <input name="name" required value="${editingSource?.name || ""}" />
              </label>
              <label class="form-field">
                <span>Handle</span>
                <input name="handle" required value="${editingSource?.handle || ""}" />
              </label>
              <label class="form-field">
                <span>Category</span>
                <input name="category" value="${editingSource?.category || "Operator / Custom"}" />
              </label>
              <label class="form-field">
                <span>Reliability (0-1)</span>
                <input name="baselineReliability" type="number" min="0" max="0.99" step="0.01" value="${editingSource?.baselineReliability ?? 0.6}" />
              </label>
              <label class="form-field">
                <span>Preferred horizon</span>
                <input name="preferredHorizon" value="${editingSource?.preferredHorizon || "2-7 days"}" />
              </label>
              <label class="form-field">
                <span>Tone</span>
                <input name="tone" value="${editingSource?.tone || "Custom"}" />
              </label>
            </div>
            <label class="form-field">
              <span>Policy template</span>
              <input name="policyTemplate" value="${editingSource?.policyTemplate || "Custom operator source"}" />
            </label>
            <label class="form-field">
              <span>Relevant sectors (comma separated)</span>
              <input name="relevantSectors" value="${formatListValue(editingSource?.relevantSectors)}" />
            </label>
            <label class="form-field">
              <span>Allowed assets (comma separated)</span>
              <input name="allowedAssets" value="${formatListValue(editingSource?.allowedAssets)}" />
            </label>
            <label class="form-field">
              <span>Special handling</span>
              <textarea name="specialHandling" rows="4">${editingSource?.specialHandling || "No special handling rules yet."}</textarea>
            </label>
            <div class="operator-actions">
              <button class="refresh-button" type="submit">${state.isMutating ? "Saving..." : editingSource ? "Update source" : "Create source"}</button>
              ${editingSource ? '<button class="mini-chip" type="button" data-new-source>Clear form</button>' : ""}
            </div>
          </form>
  `;

  const operatorLeftColumn = `
        <div class="operator-column">
          ${manualInboxSection}
          ${sourceCrudSection}
        </div>
  `;

  const operatorRightColumn = `
        <div class="operator-column">
          <div class="section-header">
            <div>
              <span class="eyebrow">Agent engine</span>
              <h3>Persisted runtime replacing request-time recomputation</h3>
            </div>
          </div>
          <div class="docs-checks">
            ${engine.stages
              .map(
                (stage, index) => `
                <article class="pipeline-card">
                  <span class="pipeline-index">0${index + 1}</span>
                  <strong>${stage.name}</strong>
                  <p>${stage.description}</p>
                  <span class="subtle">${stage.metric}</span>
                </article>
              `
              )
              .join("")}
          </div>
          <article class="operator-form">
            <div class="section-header compact">
              <div>
                <span class="eyebrow">Runtime summary</span>
                <h3>Read-only engine and eval status</h3>
              </div>
            </div>
            <div class="context-grid">
              <article class="context-item">
                <span>Claims extracted</span>
                <strong>${engine.summary.claimCount || 0}</strong>
              </article>
              <article class="context-item">
                <span>Actionable claims</span>
                <strong>${engine.summary.actionableCount || 0}</strong>
              </article>
              <article class="context-item">
                <span>Latest run</span>
                <strong>${formatGeneratedAt(engine.generatedAt || status.seededAt)}</strong>
              </article>
              <article class="context-item">
                <span>Source coverage</span>
                <strong>${engine.summary.sourceCount || 0}</strong>
              </article>
              <article class="context-item">
                <span>Extractor mode</span>
                <strong>${extractor.activeMode || "heuristic"}</strong>
              </article>
              <article class="context-item">
                <span>Cache / live</span>
                <strong>${extractor.cacheHits || 0} / ${extractor.liveExtractions || 0}</strong>
              </article>
              <article class="context-item">
                <span>Fallback count</span>
                <strong>${extractor.fallbackCount || 0}</strong>
              </article>
              <article class="context-item">
                <span>Model</span>
                <strong>${extractor.model || "Not configured"}</strong>
              </article>
              <article class="context-item">
                <span>Latest eval score</span>
                <strong>${latestEval ? formatScorePercent(latestEval.summary.averageScore) : "Pending"}</strong>
              </article>
              <article class="context-item">
                <span>Latest eval exact</span>
                <strong>${latestEval ? `${latestEval.summary.exactMatchCount}/${latestEval.summary.caseCount}` : "0/0"}</strong>
              </article>
              <article class="context-item">
                <span>Eval gate</span>
                <strong>${latestEval?.gate?.passed === false ? "Failed" : latestEval ? "Passed" : "Pending"}</strong>
              </article>
              <article class="context-item">
                <span>Scheduler last run</span>
                <strong>${runtime.scheduler.lastRunAt ? formatGeneratedAt(runtime.scheduler.lastRunAt) : "Waiting"}</strong>
              </article>
            </div>
            <div class="operator-list">
              ${engine.notes
                .map(
                  (note) => `
                  <article class="context-item">
                    <span>Engine note</span>
                    <strong>${note}</strong>
                  </article>
                `
                )
                .join("")}
              ${
                latestEval
                  ? `
                    <article class="context-item">
                      <span>Eval delta</span>
                      <strong>${latestEval.summary.deltaVsPreviousAverageScore == null ? "Baseline run" : `${latestEval.summary.deltaVsPreviousAverageScore > 0 ? "+" : ""}${Math.round(latestEval.summary.deltaVsPreviousAverageScore * 100)} pts`}</strong>
                    </article>
                  `
                  : ""
              }
              ${
                runtime.scheduler.lastError
                  ? `
                    <article class="context-item">
                      <span>Scheduler error</span>
                      <strong>${runtime.scheduler.lastError}</strong>
                    </article>
                  `
                  : ""
              }
              ${
                Array.isArray(market?.warnings) && market.warnings.length
                  ? market.warnings
                      .slice(0, 2)
                      .map(
                        (warning) => `
                        <article class="context-item">
                          <span>Market warning</span>
                          <strong>${warning}</strong>
                        </article>
                      `
                      )
                      .join("")
                  : ""
              }
            </div>
          </article>
          <div class="section-header compact">
            <div>
              <span class="eyebrow">Current outputs</span>
              <h3>Read-only narrative and decision state</h3>
            </div>
          </div>
          <div class="operator-list operator-list-scroll">
            ${clusters
              .slice(0, 4)
              .map(
                (cluster) => `
                <article class="operator-card">
                  <div class="operator-card-head">
                    <div>
                      <strong>${cluster.title}</strong>
                      <span>${cluster.sourceAgreement}</span>
                    </div>
                    <span class="pill">${cluster.policyOutcome}</span>
                  </div>
                  <p>${cluster.summary}</p>
                  <div class="tag-row">
                    <span class="tag">${cluster.dominantDirection}</span>
                    <span class="tag">${cluster.timeWindow}</span>
                    <span class="tag">${formatPercent(cluster.agreementScore)}</span>
                  </div>
                </article>
              `
              )
              .join("")}
            ${decisions
              .slice(0, 4)
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
                  <div class="tag-row">
                    <span class="tag">${formatPercent(decision.confidence)}</span>
                    <span class="tag">${decision.vetoed ? "Policy-adjusted" : "Direct output"}</span>
                  </div>
                </article>
              `
              )
              .join("")}
            ${
              vetoedSignals.length
                ? vetoedSignals
                    .slice(0, 3)
                    .map(
                      (item) => `
                      <article class="operator-card">
                        <div class="operator-card-head">
                          <div>
                            <strong>${item.asset}</strong>
                            <span>${item.status}</span>
                          </div>
                          <span class="pill pill-muted">${item.candidateAction} -> ${item.finalAction}</span>
                        </div>
                        <p>${item.reason}</p>
                      </article>
                    `
                    )
                    .join("")
                : ""
            }
          </div>
        </div>
  `;

  const operatorSection = `
      <section class="section-card operator-shell">
        ${operatorLeftColumn}
        ${operatorRightColumn}
      </section>
  `;

  const capabilitySection = `
      <section class="section-card">
        <div class="section-header">
          <div>
            <span class="eyebrow">Capabilities</span>
            <h3>What the operator surface now controls and tracks</h3>
          </div>
          <p class="section-copy">This page now acts as the engine control tower whether you are using the fake seed, a pasted manual inbox, or the live X timeline sync.</p>
        </div>
        <div class="docs-checks">
          ${adminRoadmap
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
  `;

  return [
    '<main class="content-shell">',
    renderStatusBanner(),
    renderOperatorNotice(),
    heroSection,
    statSection,
    pipelineSection,
    operatorSection,
    renderReplayInspector(),
    capabilitySection,
    '</main>'
  ].join("");
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

function renderOnboardingStepCards(currentStep) {
  const steps = [
    {
      title: "Personal setup",
      body: "Name, goals, risk tolerance, and decision horizon so later advice is framed correctly."
    },
    {
      title: "Cash flow & safety net",
      body: "Income, expenses, liquidity needs, and emergency reserves to anchor risk capacity."
    },
    {
      title: "Investments & accounts",
      body: "Funds, ETFs, stocks, crypto, and account wrappers with rough values and cost basis."
    },
    {
      title: "Pension / insurance",
      body: "Rentenversicherung, bAV, pension wrappers, and recurring retirement contributions."
    },
    {
      title: "Liabilities & contracts",
      body: "Mortgage, loans, leases, and contract uploads so advice can reflect obligations."
    },
    {
      title: "Review & save",
      body: "Confirm what is missing, save the profile, then start asking asset-specific questions."
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
  const cashSummary = buildProfileCashSummary(profile);
  const trackedTickers = getTrackedAssetTickers(profile);
  const { trackedAssets, actionableAssets, urgentAssets, priorityAssets } = buildTrackedPortfolioAnalytics(profile);
  const recentTrackedPosts = sortPostsByCreatedAt(
    getData().posts.filter((post) =>
      (post.mappedAssets || []).some((asset) => trackedTickers.includes(asset))
    )
  ).slice(0, 6);
  const setupPanel = trackedAssets.length
    ? ""
    : `
      <section class="section-card today-empty-card">
        <div>
          <span class="eyebrow">Personal setup</span>
          <h3>Tell the app what you actually care about</h3>
          <p>Add holdings or a watchlist in the Advisor tab, or paste real posts into the manual inbox on the Operator tab. That is the shortest path from demo to daily utility.</p>
        </div>
        <div class="operator-actions">
          <button class="refresh-button" data-view="advisor">Open advisor setup</button>
          <button class="mini-chip" data-view="admin">Open manual inbox</button>
        </div>
      </section>
    `;
  const priorityCards = priorityAssets.length
    ? priorityAssets
        .slice(0, 4)
        .map((item) => `
          <article class="today-card">
            <div class="operator-card-head">
              <div>
                <strong>${item.ticker}</strong>
                <span>${item.holding ? `Holding · ${formatCurrency(item.holding.currentValue)}` : "Watchlist"}</span>
              </div>
              <span class="decision-badge decision-${(item.decision?.action || "hold").toLowerCase()}">${item.decision?.action || "WATCH"}</span>
            </div>
            <p>${item.decision?.rationale?.[0] || item.asset?.thesis || "No active recommendation yet."}</p>
            <div class="tag-row">
              ${item.asset ? `<span class="tag">${item.asset.bucket}</span>` : ""}
              ${item.decision ? `<span class="tag">${formatPercent(item.decision.confidence || 0)}</span>` : '<span class="tag">Waiting for signal</span>'}
              <span class="tag">${item.relatedPosts.length} relevant posts</span>
            </div>
            <div class="operator-actions">
              <button class="mini-chip" data-asset="${item.ticker}">Asset view</button>
              <button class="mini-chip" data-view="advisor">Advisor</button>
            </div>
          </article>
        `)
        .join("")
    : '<article class="today-card today-card-empty"><strong>No tracked assets yet</strong><p>Use the advisor profile to add holdings or a watchlist and the app will prioritize them here.</p></article>';
  const trackedPostCards = recentTrackedPosts.length
    ? recentTrackedPosts
        .map((post) => {
          const source = getSource(post.sourceId);
          return `
            <article class="operator-card">
              <div class="operator-card-head">
                <div>
                  <strong>${source?.handle || post.sourceId}</strong>
                  <span>${formatGeneratedAt(post.createdAt)}</span>
                </div>
                <span class="pill pill-muted">${(post.mappedAssets || []).join(", ") || "Unmapped"}</span>
              </div>
              <p>${post.body}</p>
            </article>
          `;
        })
        .join("")
    : '<article class="operator-card"><strong>No portfolio-linked posts yet</strong><p>Import manual posts or enable the X feed to start getting a personal daily brief.</p></article>';

  return `
    <main class="content-shell">
      ${renderStatusBanner()}
      <section class="hero-panel today-hero">
        <div>
          <span class="eyebrow">Today</span>
          <h2>${trackedAssets.length ? "Your portfolio-first signal brief" : "Set up your personal signal brief"}</h2>
          <p>
            ${trackedAssets.length
              ? `Tracking ${trackedAssets.length} assets across holdings and watchlist. ${actionableAssets.length} have active calls and ${urgentAssets.length} look immediate enough to review first.`
              : "The engine is ready, but it becomes useful once it knows your holdings/watchlist and has real posts to ingest."}
          </p>
        </div>
        <div class="hero-decision">
          <span class="pill pill-muted">Single-user mode</span>
          <strong>${trackedAssets.length ? `${urgentAssets.length} urgent / ${actionableAssets.length} active` : "Waiting for profile"}</strong>
          <span>${cashSummary.emergencyCoverageMonths ? `${cashSummary.emergencyCoverageMonths} months emergency cover` : "No liquidity baseline saved yet"}</span>
          <p>${cashSummary.monthlyBurn > 0 ? `Monthly burn exceeds income by ${formatCurrency(cashSummary.monthlyBurn)}.` : "Monthly cash flow is currently neutral or positive."}</p>
        </div>
      </section>
      ${setupPanel}
      <section class="stat-grid">
        <article class="stat-card">
          <span class="eyebrow">Tracked assets</span>
          <strong>${trackedAssets.length}</strong>
          <p>${trackedAssets.length ? `${profile.holdings.length} holdings and ${(profile.watchlist || []).length} watchlist names are driving the brief.` : "Add holdings or watchlist tickers in the advisor setup."}</p>
        </article>
        <article class="stat-card">
          <span class="eyebrow">Active calls</span>
          <strong>${actionableAssets.length}</strong>
          <p>${urgentAssets.length ? `${urgentAssets.length} assets currently sit in BUY or SELL territory.` : "No tracked assets are currently flashing urgent action."}</p>
        </article>
        <article class="stat-card">
          <span class="eyebrow">Relevant posts</span>
          <strong>${recentTrackedPosts.length}</strong>
          <p>${recentTrackedPosts.length ? "Recent posts linked to your tracked assets." : "Import real posts or enable X sync to populate this section."}</p>
        </article>
        <article class="stat-card">
          <span class="eyebrow">Safety net</span>
          <strong>${cashSummary.emergencyCoverageMonths ? `${cashSummary.emergencyCoverageMonths}m` : "Pending"}</strong>
          <p>${profile.targetEmergencyFundMonths ? `Target: ${profile.targetEmergencyFundMonths} months.` : "Set your emergency fund target in the advisor profile."}</p>
        </article>
      </section>
      <section class="section-card split-card">
        <div>
          <div class="section-header">
            <div>
              <span class="eyebrow">Priority assets</span>
              <h3>What to look at first</h3>
            </div>
          </div>
          <div class="today-grid">
            ${priorityCards}
          </div>
        </div>
        <div>
          <div class="section-header">
            <div>
              <span class="eyebrow">Recent portfolio-linked posts</span>
              <h3>Signals touching your names</h3>
            </div>
          </div>
          <div class="operator-list">
            ${trackedPostCards}
          </div>
        </div>
      </section>
      ${renderHero()}
      ${renderStatCards()}
      ${renderAnalysedTweetsWindow()}
      ${renderDecisionCards()}
      ${renderClusterBoard()}
      ${renderSignalFeed()}
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

  return `
    <article class="section-card nested-card">
      <span class="eyebrow">Decision summary</span>
      <h3>${decision.rationale[0]}</h3>
      <p>${decision.whyNot[0]}</p>
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
  const relatedClusters = decision?.clusterIds?.length
    ? decision.clusterIds.map((clusterId) => getCluster(clusterId)).filter(Boolean)
    : getData().clusters.filter((cluster) => cluster.mappedAssets.includes(asset.ticker));

  return `
    <main class="content-shell">
      ${renderStatusBanner()}
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

function renderAdvisorView() {
  const { monitoredUniverse } = getData();
  const advisor = getAdvisor();
  const profile = getProfileDraft();
  const latestAnswer = getLatestAdvisorAnswer();
  const onboardingSummary = buildOnboardingSummary(profile);
  const currentStep = state.profileOnboardingStep || 0;
  const documentDraft = getProfileDocumentDraft();
  const onboardingPanels = [
    `
      <section class="onboarding-panel">
        <div class="section-header">
          <div>
            <span class="eyebrow">Step 1</span>
            <h3>Set the profile owner and your decision frame</h3>
          </div>
          <p class="section-copy">This gives the advisor the context it needs before it looks at specific products or positions.</p>
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
            <input name="investmentHorizon" value="${escapeHtml(profile.investmentHorizon || "")}" placeholder="e.g. 10+ years for retirement, 3 years for house deposit" />
          </label>
          <label class="form-field">
            <span>Liquidity needs</span>
            <input name="liquidityNeeds" value="${escapeHtml(profile.liquidityNeeds || "")}" placeholder="Low, Medium, High" />
          </label>
        </div>
        <label class="form-field">
          <span>Goals (comma separated)</span>
          <input
            name="goals"
            value="${escapeHtml((profile.goals || []).join(", "))}"
            placeholder="Retirement, preserve liquidity, home purchase, education, passive income"
          />
        </label>
        <label class="form-field">
          <span>Watchlist tickers (comma separated)</span>
          <input
            name="watchlist"
            value="${escapeHtml((profile.watchlist || []).join(", "))}"
            placeholder="NVDA, BTC, VWCE, cash proxy, mortgage-linked watch item"
          />
        </label>
        <article class="status-inline">
          <strong>What to gather for this step</strong>
          <p>Think in real planning goals, then add the few tickers or instruments you actually want this app to watch for you every day.</p>
        </article>
      </section>
    `,
    `
      <section class="onboarding-panel">
        <div class="section-header">
          <div>
            <span class="eyebrow">Step 2</span>
            <h3>Map income, expenses, and your safety buffer</h3>
          </div>
          <p class="section-copy">This is what turns a generic portfolio view into something allocation-aware.</p>
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
            <span>Target emergency-fund months</span>
            <input type="number" step="0.1" name="targetEmergencyFundMonths" value="${profile.targetEmergencyFundMonths ?? 6}" />
          </label>
        </div>
        <div class="context-grid compact-grid">
          <article class="context-item">
            <span>Monthly free cash flow</span>
            <strong>${formatCurrency((profile.monthlyNetIncome || 0) - (profile.monthlyExpenses || 0))}</strong>
          </article>
          <article class="context-item">
            <span>Current reserve</span>
            <strong>${formatCurrency(profile.emergencyFund || 0)}</strong>
          </article>
        </div>
      </section>
    `,
    `
      <section class="onboarding-panel">
        <div class="section-header">
          <div>
            <span class="eyebrow">Step 3</span>
            <h3>Add your investments, funds, ETFs, and brokerage accounts</h3>
          </div>
          <p class="section-copy">Paste a broker export if you have one, or fall back to the simple one-line format below. Either path updates the same holdings list.</p>
        </div>
        <label class="form-field">
          <span>Quick import from CSV / TSV / semicolon export</span>
          <textarea
            name="holdingsImport"
            rows="6"
            placeholder="ticker,current_value,cost_basis,account,notes&#10;NVDA,14800,9200,Brokerage,Core AI position&#10;BTC,5200,3400,Cold Wallet,Long-term sleeve"
          ></textarea>
          <small>Supported headers include ticker/symbol, current_value/value, cost_basis, account, and notes. Click import to replace the holdings draft with the pasted table.</small>
        </label>
        <div class="operator-actions">
          <button class="mini-chip" type="button" data-import-holdings>Import pasted holdings</button>
        </div>
        <label class="form-field">
          <span>Holdings — one per line: TICKER|Category|CurrentValue|CostBasis|AccountType|Notes</span>
          <textarea
            name="holdings"
            rows="9"
            placeholder="VWCE|ETF|18500|14200|Brokerage|Global equity core&#10;IE00B4L5Y983|ETF|7600|7020|Brokerage|MSCI World ETF&#10;Cash reserve|Cash|12000|12000|Savings|Broker cash buffer&#10;BTC|Crypto|5200|3400|Cold Wallet|Long-term speculative sleeve"
          >${escapeHtml(serializeHoldings(profile.holdings))}</textarea>
        </label>
        <div class="context-grid compact-grid">
          <article class="context-item">
            <span>Tracked investment holdings</span>
            <strong>${profile.holdings.length}</strong>
          </article>
          <article class="context-item">
            <span>Approximate current value</span>
            <strong>${formatCurrency(onboardingSummary.holdingsTotal)}</strong>
          </article>
          <article class="context-item">
            <span>Tracked assets total</span>
            <strong>${onboardingSummary.trackedAssetCount}</strong>
          </article>
        </div>
      </section>
    `,
    `
      <section class="onboarding-panel">
        <div class="section-header">
          <div>
            <span class="eyebrow">Step 4</span>
            <h3>Capture retirement and insurance wrappers</h3>
          </div>
          <p class="section-copy">This is the place for Rentenversicherung, private pension, bAV, Riester/Rürup-style products, or any policy wrapper with cash value or recurring contribution.</p>
        </div>
        <label class="form-field">
          <span>Retirement / insurance products — one per line: Name|Type|Provider|CurrentValue|MonthlyContribution|Notes</span>
          <textarea
            name="retirementProducts"
            rows="8"
            placeholder="Allianz BasisRente|Rentenversicherung|Allianz|24000|350|Tax-advantaged retirement contract&#10;Company pension|bAV|Employer plan|11800|220|Salary sacrifice plan"
          >${escapeHtml(serializeRetirementProducts(profile.retirementProducts || []))}</textarea>
        </label>
        <div class="context-grid compact-grid">
          <article class="context-item">
            <span>Tracked pension / insurance wrappers</span>
            <strong>${(profile.retirementProducts || []).length}</strong>
          </article>
          <article class="context-item">
            <span>Approximate current value</span>
            <strong>${formatCurrency(onboardingSummary.retirementTotal)}</strong>
          </article>
        </div>
      </section>
    `,
    `
      <section class="onboarding-panel">
        <div class="section-header">
          <div>
            <span class="eyebrow">Step 5</span>
            <h3>List liabilities and upload supporting contracts</h3>
          </div>
          <p class="section-copy">Add loans, mortgage obligations, financing, and any contracts you want to remember during future advice sessions.</p>
        </div>
        <label class="form-field">
          <span>Liabilities — one per line: Name|Category|Balance|InterestRate|MonthlyPayment|Notes</span>
          <textarea
            name="liabilities"
            rows="8"
            placeholder="Primary mortgage|Mortgage|240000|3.7|1580|Apartment financing&#10;KfW loan|Loan|18500|1.2|220|Energy retrofit program"
          >${escapeHtml(serializeLiabilities(profile.liabilities))}</textarea>
        </label>
        <label class="form-field">
          <span>Upload contracts or account statements</span>
          <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.csv,.txt" data-profile-documents />
          <small>Files stay in the browser for now; the app stores the document index and metadata in your profile so you have a checklist for onboarding.</small>
        </label>
        <input type="hidden" name="documentsJson" value="${escapeHtml(JSON.stringify(documentDraft))}" />
        <div class="document-list">
          ${
            documentDraft.length
              ? documentDraft
                  .map(
                    (document) => `
                    <article class="document-card">
                      <div>
                        <strong>${escapeHtml(document.name)}</strong>
                        <p>${escapeHtml(document.category)} · ${document.sizeBytes ? `${Math.round(document.sizeBytes / 1024)} KB` : "Size unavailable"}</p>
                      </div>
                      <button type="button" class="mini-chip" data-remove-document="${document.id}">Remove</button>
                    </article>
                  `
                  )
                  .join("")
              : '<article class="status-inline"><strong>No documents indexed yet</strong><p>Add insurance contracts, ETF/fund statements, pension summaries, or loan paperwork when you have them handy.</p></article>'
          }
        </div>
      </section>
    `,
    `
      <section class="onboarding-panel">
        <div class="section-header">
          <div>
            <span class="eyebrow">Step 6</span>
            <h3>Review the profile and save it</h3>
          </div>
          <p class="section-copy">You do not need perfect data. Approximate balances plus the right account labels are enough to start getting useful answers.</p>
        </div>
        <div class="onboarding-review-grid">
          <article class="context-item">
            <span>Goals captured</span>
            <strong>${profile.goals.length}</strong>
            <p>${escapeHtml((profile.goals || []).join(", ") || "No explicit goals yet")}</p>
          </article>
          <article class="context-item">
            <span>Investment holdings</span>
            <strong>${profile.holdings.length}</strong>
            <p>${formatCurrency(onboardingSummary.holdingsTotal)} tracked</p>
          </article>
          <article class="context-item">
            <span>Watchlist assets</span>
            <strong>${(profile.watchlist || []).length}</strong>
            <p>${escapeHtml((profile.watchlist || []).join(", ") || "No watchlist names yet")}</p>
          </article>
          <article class="context-item">
            <span>Retirement / insurance</span>
            <strong>${(profile.retirementProducts || []).length}</strong>
            <p>${formatCurrency(onboardingSummary.retirementTotal)} tracked</p>
          </article>
          <article class="context-item">
            <span>Liabilities</span>
            <strong>${profile.liabilities.length}</strong>
            <p>${formatCurrency(onboardingSummary.liabilitiesTotal)} tracked</p>
          </article>
          <article class="context-item">
            <span>Documents indexed</span>
            <strong>${onboardingSummary.documentCount}</strong>
            <p>${onboardingSummary.documentCount ? "Contracts and statements are listed for later review." : "Add documents later if you want a fuller profile."}</p>
          </article>
        </div>
        <label class="form-field">
          <span>Additional notes for the advisor</span>
          <textarea name="notes" rows="5" placeholder="Anything the advisor should remember: concentrated stock risk, planned property purchase, pension constraints, family cash needs...">${escapeHtml(profile.notes || "")}</textarea>
        </label>
        <article class="status-inline">
          <strong>Suggested first uploads / entries</strong>
          <p>Broker statements, pension overview, Rentenversicherung contract, ETF/fund account summary, mortgage statement, and current emergency-cash balance are the highest-value first inputs.</p>
        </article>
      </section>
    `
  ];

  return `
    <main class="content-shell">
      ${renderStatusBanner()}
      <section class="hero-panel">
        <div>
          <span class="eyebrow">Portfolio-aware advisor</span>
          <h2>Complete a guided onboarding flow, then ask explicit asset questions against the latest internal signals.</h2>
          <p>
            This assistant now walks you step by step through building your initial financial profile, including funds, ETFs, pension wrappers, Rentenversicherung-style products, liabilities, and supporting contracts.
          </p>
        </div>
        <div class="hero-decision">
          <span class="pill pill-muted">Onboarding + advisor</span>
          <strong>Step ${currentStep + 1} of 6</strong>
          <p>${latestAnswer ? `Latest answer: ${latestAnswer.assetTicker} at ${formatGeneratedAt(latestAnswer.createdAt)}.` : "Finish onboarding, save the profile, and ask the first asset question."}</p>
        </div>
      </section>
      ${
        state.advisorError
          ? `
            <article class="section-card status-inline status-inline-error">
              <strong>Advisor issue</strong>
              <p>${state.advisorError}</p>
            </article>
          `
          : ""
      }
      ${
        state.advisorNotice
          ? `
            <article class="section-card status-inline status-success">
              <strong>Advisor update</strong>
              <p>${state.advisorNotice}</p>
            </article>
          `
          : ""
      }
      <section class="section-card split-card">
        <div>
          <div class="section-header">
            <div>
              <span class="eyebrow">Financial profile onboarding</span>
              <h3>Build the first complete version of your household balance sheet</h3>
            </div>
            <p class="section-copy">You can move step by step. Save once you are happy with the review screen.</p>
          </div>
          <form class="operator-form" data-profile-form>
            ${renderOnboardingStepCards(currentStep)}
            ${onboardingPanels[currentStep] || onboardingPanels[0]}
            <div class="operator-actions">
              <button class="mini-chip" type="button" data-onboarding-prev ${currentStep === 0 ? "disabled" : ""}>Previous step</button>
              ${
                currentStep < onboardingPanels.length - 1
                  ? `<button class="refresh-button" type="button" data-onboarding-next>Continue to step ${currentStep + 2}</button>`
                  : `<button class="refresh-button" type="submit" ${state.isSavingProfile ? "disabled" : ""}>${state.isSavingProfile ? "Saving profile..." : "Save financial profile"}</button>`
              }
              ${
                currentStep === onboardingPanels.length - 1
                  ? `<button class="mini-chip" type="button" data-onboarding-step="0">Restart from step 1</button>`
                  : ""
              }
            </div>
            <div class="tag-row">
              <span class="tag">${profile.holdings.length} holdings</span>
              <span class="tag">${(profile.watchlist || []).length} watchlist names</span>
              <span class="tag">${(profile.retirementProducts || []).length} pension / insurance entries</span>
              <span class="tag">${profile.liabilities.length} liabilities</span>
              <span class="tag">${onboardingSummary.documentCount} documents indexed</span>
              <span class="tag">${formatCurrency(onboardingSummary.holdingsTotal + onboardingSummary.retirementTotal)} invested assets tracked</span>
            </div>
            <div class="onboarding-note">
              <strong>Important:</strong> the current app stores the profile and document index, not the raw uploaded contract files themselves.
              Use uploads here as an onboarding checklist until a full document vault exists.
            </div>
            <div class="operator-actions">
              <button class="refresh-button" type="submit" ${state.isSavingProfile ? "disabled" : ""}>
                ${state.isSavingProfile ? "Saving progress..." : "Save progress at any time"}
              </button>
            </div>
          </form>
        </div>
        <div>
          <div class="section-header">
            <div>
              <span class="eyebrow">Ask the advisor</span>
              <h3>Request asset-specific guidance</h3>
            </div>
          </div>
          <form class="operator-form" data-advisor-form>
            <label class="form-field">
              <span>Asset</span>
              <input name="assetTicker" list="advisor-asset-list" value="${escapeHtml(latestAnswer?.assetTicker || "")}" placeholder="BTC, NVDA, VTI, cash, mortgage-linked question..." />
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
              <textarea name="question" rows="5" placeholder="Example: Should I add to BTC over the next month given my current cash buffer and loan load?"></textarea>
            </label>
            <div class="operator-actions">
              <button class="refresh-button" type="submit" ${state.isAskingAdvisor ? "disabled" : ""}>
                ${state.isAskingAdvisor ? "Generating answer..." : "Ask advisor"}
              </button>
            </div>
          </form>
          ${
            latestAnswer
              ? `
                <article class="section-card nested-card">
                  <span class="eyebrow">Latest answer</span>
                  <h3>${latestAnswer.answer.headline}</h3>
                  <p>${latestAnswer.answer.answer}</p>
                  <div class="tag-row">
                    <span class="tag">${latestAnswer.assetTicker}</span>
                    <span class="tag">${latestAnswer.answer.stance}</span>
                    <span class="tag">${latestAnswer.answer.suitability}</span>
                    <span class="tag">${formatPercent(latestAnswer.answer.confidence || 0)}</span>
                    <span class="tag">${formatEnumLabel(latestAnswer.provider)}</span>
                  </div>
                  <div class="details-stack">
                    <div>
                      <strong>Rationale</strong>
                      <ul>${latestAnswer.answer.rationale.map((item) => `<li>${item}</li>`).join("")}</ul>
                    </div>
                    <div>
                      <strong>Portfolio fit</strong>
                      <ul>${latestAnswer.answer.portfolioFit.map((item) => `<li>${item}</li>`).join("")}</ul>
                    </div>
                    <div>
                      <strong>Latest signals</strong>
                      <ul>${latestAnswer.answer.latestSignals.map((item) => `<li>${item}</li>`).join("")}</ul>
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
                </article>
              `
              : `
                <article class="status-inline">
                  <strong>No advice generated yet</strong>
                  <p>Save your profile, then ask a ticker-specific question to generate an answer grounded in the latest pipeline snapshot.</p>
                </article>
              `
          }
          <div class="operator-list">
            ${advisor.history
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
              .join("")}
          </div>
        </div>
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
