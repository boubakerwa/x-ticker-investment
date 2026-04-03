const DEFAULT_MAX_SNAPSHOT_AGE_HOURS = Number(process.env.TRADE_READY_MAX_SNAPSHOT_AGE_HOURS || 24);
const DEFAULT_MODE = String(process.env.TRADE_READY_MODE || "fail-closed").trim().toLowerCase();

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function normalizeResearchStatus(value) {
  return String(value || "discovery")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function round(value, digits = 1) {
  return Number(Number(value || 0).toFixed(digits));
}

function buildGate(key, label, passed, detail) {
  return {
    key,
    label,
    passed: Boolean(passed),
    detail: String(detail || "").trim()
  };
}

function getEvalMode(run) {
  return String(run?.extractor?.activeMode || run?.validationMode || run?.model?.provider || "heuristic")
    .trim()
    .toLowerCase();
}

function selectLatestModelEval(evalRuns = []) {
  return (
    (evalRuns || []).find((run) => getEvalMode(run) !== "heuristic") ||
    (evalRuns || [])[0] ||
    null
  );
}

function buildReadyAssets(reviewItems = [], approvedResearchAssets = new Set()) {
  return (reviewItems || [])
    .filter(
      (item) =>
        ["BUY", "SELL"].includes(String(item?.action || "").trim().toUpperCase()) &&
        String(item?.reviewStatus || "").trim().toLowerCase() === "approved" &&
        approvedResearchAssets.has(normalizeTicker(item?.asset))
    )
    .map((item) => ({
      asset: normalizeTicker(item.asset),
      action: String(item.action || "").trim().toUpperCase(),
      confidence: Number(item.confidence || 0),
      horizon: String(item.horizon || "").trim(),
      summary: String(item.summary || item.rationale?.[0] || "").trim()
    }))
    .sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0));
}

function buildApprovedResearchAssets(researchDossiers = []) {
  const approvedAssets = new Set();

  for (const dossier of researchDossiers || []) {
    if (normalizeResearchStatus(dossier?.status) !== "approved") {
      continue;
    }

    for (const asset of dossier?.assets || []) {
      const cleanTicker = normalizeTicker(asset);

      if (cleanTicker) {
        approvedAssets.add(cleanTicker);
      }
    }
  }

  return approvedAssets;
}

export function buildTradeReadinessState({
  snapshot = null,
  evalRuns = [],
  researchDossiers = [],
  reviewItems = [],
  mode = DEFAULT_MODE,
  maxSnapshotAgeHours = DEFAULT_MAX_SNAPSHOT_AGE_HOURS
} = {}) {
  const appData = snapshot?.appData || {};
  const posts = Array.isArray(appData.posts) ? appData.posts : [];
  const feedMode = String(appData.metadata?.tweetFeedMode || "unknown").trim().toLowerCase();
  const extractorMode = String(appData.engine?.extractor?.activeMode || "heuristic")
    .trim()
    .toLowerCase();
  const marketProvider = String(appData.market?.activeProvider || "unknown").trim().toLowerCase();
  const snapshotGeneratedAt =
    String(snapshot?.generatedAt || appData.metadata?.generatedAt || "").trim() || "";
  const snapshotAgeMs = snapshotGeneratedAt
    ? Math.max(0, Date.now() - new Date(snapshotGeneratedAt).getTime())
    : Number.POSITIVE_INFINITY;
  const snapshotAgeHours = Number.isFinite(snapshotAgeMs)
    ? round(snapshotAgeMs / (60 * 60 * 1000), 1)
    : null;
  const latestModelEval = selectLatestModelEval(evalRuns);
  const approvedResearchAssets = buildApprovedResearchAssets(researchDossiers);
  const readyAssets = buildReadyAssets(reviewItems, approvedResearchAssets);
  const pendingActionAssets = (reviewItems || []).filter(
    (item) =>
      ["BUY", "SELL"].includes(String(item?.action || "").trim().toUpperCase()) &&
      String(item?.reviewStatus || "").trim().toLowerCase() === "proposed"
  );
  const gates = [
    buildGate(
      "snapshot_freshness",
      "Fresh snapshot",
      snapshotGeneratedAt && snapshotAgeHours != null && snapshotAgeHours <= maxSnapshotAgeHours,
      snapshotGeneratedAt
        ? `Latest pipeline snapshot is ${snapshotAgeHours}h old.`
        : "No pipeline snapshot timestamp is available."
    ),
    buildGate(
      "signal_input",
      "Real signal input",
      feedMode !== "fake" && posts.length > 0,
      feedMode === "fake"
        ? "The desk is still on demo feed mode."
        : posts.length
          ? `${posts.length} recent posts are flowing through ${feedMode || "manual"} mode.`
          : "No recent posts are available yet."
    ),
    buildGate(
      "market_context",
      "Real market context",
      Boolean(marketProvider) && marketProvider !== "mock",
      marketProvider === "mock"
        ? "Market context is still synthetic."
        : `Market snapshot provider: ${marketProvider || "unknown"}.`
    ),
    buildGate(
      "model_extraction",
      "Model-backed extraction",
      extractorMode === "openai",
      extractorMode === "openai"
        ? "Structured extraction is running in model-backed mode."
        : `Extractor is currently ${extractorMode || "heuristic"}, which is not trade-ready.`
    ),
    buildGate(
      "evaluation_gate",
      "Latest model eval gate",
      Boolean(latestModelEval?.gate?.passed) && getEvalMode(latestModelEval) !== "heuristic",
      latestModelEval
        ? latestModelEval.gate?.passed
          ? `Latest model eval ${latestModelEval.id} passed the regression gate.`
          : `Latest model eval ${latestModelEval.id} failed at least one regression gate.`
        : "No model-backed eval run is available yet."
    ),
    buildGate(
      "approved_research",
      "Approved research",
      approvedResearchAssets.size > 0,
      approvedResearchAssets.size
        ? `${approvedResearchAssets.size} asset${approvedResearchAssets.size === 1 ? "" : "s"} have approved research dossiers.`
        : "No approved research dossiers exist yet."
    ),
    buildGate(
      "approved_action",
      "Approved current action",
      readyAssets.length > 0,
      readyAssets.length
        ? `${readyAssets.length} current BUY/SELL decision${readyAssets.length === 1 ? "" : "s"} are fully approved.`
        : pendingActionAssets.length
          ? `${pendingActionAssets.length} BUY/SELL decision${pendingActionAssets.length === 1 ? "" : "s"} still need operator approval.`
          : "No current BUY/SELL decision is fully approved yet."
    )
  ];
  const blockingGates = gates.filter((gate) => !gate.passed);
  const enabled = mode !== "off";
  const ready = enabled ? blockingGates.length === 0 : false;

  return {
    enabled,
    mode: enabled ? "fail-closed" : "off",
    ready,
    status: !enabled ? "disabled" : ready ? "ready" : "locked",
    generatedAt: new Date().toISOString(),
    snapshotGeneratedAt,
    snapshotAgeHours,
    actionRule: ready
      ? `Real-world action is allowed only for the currently approved BUY/SELL assets: ${readyAssets
          .map((item) => `${item.asset} ${item.action}`)
          .join(", ")}.`
      : "Real-world action is locked. Use watch-only analysis or paper trading until every trade-ready gate passes.",
    summary: {
      passedCount: gates.filter((gate) => gate.passed).length,
      totalCount: gates.length,
      feedMode,
      postsCount: posts.length,
      marketProvider,
      extractorMode,
      approvedResearchAssetCount: approvedResearchAssets.size,
      approvedActionAssetCount: readyAssets.length,
      latestModelEvalId: latestModelEval?.id || "",
      latestModelEvalPassed: Boolean(latestModelEval?.gate?.passed)
    },
    gates,
    blockingGates,
    readyAssets
  };
}
