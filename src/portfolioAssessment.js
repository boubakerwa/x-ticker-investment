import { monitoredUniverse } from "./data.js";

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function normalizeResearchStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function clamp(value, minValue = 0, maxValue = 100) {
  return Math.min(maxValue, Math.max(minValue, Number(value) || 0));
}

function uniqueStrings(items = []) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function getTrackedTickers(financialProfile = {}) {
  return [
    ...new Set(
      [
        ...(financialProfile.holdings || []).map((holding) => normalizeTicker(holding.ticker)),
        ...(financialProfile.watchlist || []).map((ticker) => normalizeTicker(ticker))
      ].filter(Boolean)
    )
  ];
}

function buildDecisionMap(snapshot = null) {
  return new Map(
    (snapshot?.appData?.decisions || [])
      .map((decision) => [normalizeTicker(decision.asset), decision])
      .filter(([ticker]) => ticker)
  );
}

function buildReviewMap(reviewItems = []) {
  return new Map(
    (reviewItems || [])
      .map((item) => [normalizeTicker(item.asset), item])
      .filter(([ticker]) => ticker)
  );
}

function getResearchRank(status) {
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

function buildResearchMap(researchDossiers = []) {
  const researchByAsset = new Map();

  for (const dossier of researchDossiers || []) {
    for (const asset of dossier?.assets || []) {
      const cleanTicker = normalizeTicker(asset);

      if (!cleanTicker) {
        continue;
      }

      const current = researchByAsset.get(cleanTicker);

      if (!current) {
        researchByAsset.set(cleanTicker, dossier);
        continue;
      }

      const rankDifference =
        getResearchRank(dossier?.status) - getResearchRank(current?.status);

      if (rankDifference > 0) {
        researchByAsset.set(cleanTicker, dossier);
        continue;
      }

      if (
        rankDifference === 0 &&
        String(dossier?.updatedAt || "").localeCompare(String(current?.updatedAt || "")) > 0
      ) {
        researchByAsset.set(cleanTicker, dossier);
      }
    }
  }

  return researchByAsset;
}

function buildPaperTradeMap(paperTradingState = null) {
  const trades = Array.isArray(paperTradingState?.trades) ? paperTradingState.trades : [];
  const tradeByAsset = new Map();
  const statusRank = {
    open: 5,
    planned: 4,
    invalidated: 3,
    closed: 2,
    cancelled: 1
  };

  for (const trade of trades) {
    const cleanTicker = normalizeTicker(trade?.asset);

    if (!cleanTicker) {
      continue;
    }

    const current = tradeByAsset.get(cleanTicker);

    if (!current) {
      tradeByAsset.set(cleanTicker, trade);
      continue;
    }

    const rankDifference =
      (statusRank[String(trade?.status || "").trim().toLowerCase()] || 0) -
      (statusRank[String(current?.status || "").trim().toLowerCase()] || 0);

    if (rankDifference > 0) {
      tradeByAsset.set(cleanTicker, trade);
      continue;
    }

    if (
      rankDifference === 0 &&
      String(trade?.updatedAt || "").localeCompare(String(current?.updatedAt || "")) > 0
    ) {
      tradeByAsset.set(cleanTicker, trade);
    }
  }

  return tradeByAsset;
}

function buildProfileSummary(financialProfile = {}) {
  const holdings = Array.isArray(financialProfile.holdings) ? financialProfile.holdings : [];
  const liabilities = Array.isArray(financialProfile.liabilities) ? financialProfile.liabilities : [];
  const totalHoldingsValue = round(
    holdings.reduce((sum, holding) => sum + Number(holding.currentValue || 0), 0),
    2
  );
  const totalLiabilitiesValue = round(
    liabilities.reduce((sum, liability) => sum + Number(liability.balance || 0), 0),
    2
  );
  const monthlyExpenses = Number(financialProfile.monthlyExpenses || 0);
  const emergencyCoverageMonths =
    monthlyExpenses > 0
      ? round(Number(financialProfile.emergencyFund || 0) / monthlyExpenses, 1)
      : 0;

  return {
    totalHoldingsValue,
    totalLiabilitiesValue,
    monthlyExpenses,
    monthlyNetIncome: Number(financialProfile.monthlyNetIncome || 0),
    monthlyBurn: round(Math.max(0, monthlyExpenses - Number(financialProfile.monthlyNetIncome || 0)), 2),
    emergencyCoverageMonths,
    targetEmergencyFundMonths: Number(financialProfile.targetEmergencyFundMonths || 6)
  };
}

function computeHoldingConcentration(holdings = []) {
  const positiveHoldings = (holdings || [])
    .map((holding) => ({
      ticker: normalizeTicker(holding.ticker),
      currentValue: Number(holding.currentValue || 0)
    }))
    .filter((holding) => holding.ticker && holding.currentValue > 0)
    .sort((left, right) => right.currentValue - left.currentValue);
  const totalHoldingsValue = positiveHoldings.reduce((sum, holding) => sum + holding.currentValue, 0);

  if (!totalHoldingsValue) {
    return {
      totalHoldingsValue: 0,
      largestHoldingWeightRatio: null,
      topThreeWeightRatio: null
    };
  }

  return {
    totalHoldingsValue,
    largestHoldingWeightRatio: round((positiveHoldings[0]?.currentValue || 0) / totalHoldingsValue, 4),
    topThreeWeightRatio: round(
      positiveHoldings.slice(0, 3).reduce((sum, holding) => sum + holding.currentValue, 0) /
        totalHoldingsValue,
      4
    )
  };
}

function scoreCoverage({ trackedTickerCount, coveredTrackedCount, liveDecisionCount }) {
  if (!trackedTickerCount) {
    return 0;
  }

  const monitoredCoverage = coveredTrackedCount / trackedTickerCount;
  const liveDecisionCoverage = liveDecisionCount / trackedTickerCount;

  return round(clamp(monitoredCoverage * 45 + liveDecisionCoverage * 55), 1);
}

function scoreGovernance({
  trackedTickerCount,
  approvedResearchCount,
  actionableTrackedCount,
  pendingReviewCount
}) {
  if (!trackedTickerCount) {
    return 0;
  }

  const approvedResearchCoverage = approvedResearchCount / trackedTickerCount;
  const actionableCoverage = actionableTrackedCount / trackedTickerCount;
  const pendingPenalty = Math.min(25, pendingReviewCount * 6);

  return round(clamp(approvedResearchCoverage * 45 + actionableCoverage * 55 - pendingPenalty), 1);
}

function scoreLiquidity(profileSummary) {
  const targetMonths = Math.max(1, Number(profileSummary.targetEmergencyFundMonths || 6));
  const coverageRatio = Number(profileSummary.emergencyCoverageMonths || 0) / targetMonths;
  const liabilityRatio =
    Number(profileSummary.totalHoldingsValue || 0) > 0
      ? Number(profileSummary.totalLiabilitiesValue || 0) / Number(profileSummary.totalHoldingsValue || 1)
      : 0;
  const burnPenalty =
    Number(profileSummary.monthlyBurn || 0) > 0 && coverageRatio < 1 ? 10 : 0;

  return round(
    clamp(coverageRatio * 100 - Math.min(40, liabilityRatio * 80) - burnPenalty),
    1
  );
}

function scoreConcentration(concentration, holdingsCount) {
  if (holdingsCount <= 1 || concentration.largestHoldingWeightRatio == null) {
    return holdingsCount ? 55 : 0;
  }

  const largestPenalty = Math.max(0, concentration.largestHoldingWeightRatio - 0.25) * 180;
  const topThreePenalty = Math.max(0, (concentration.topThreeWeightRatio || 0) - 0.6) * 120;

  return round(clamp(100 - largestPenalty - topThreePenalty), 1);
}

function scoreLearning(paperTradingState = null) {
  const summary = paperTradingState?.summary || {};
  const openCount = Number(summary.openCount || 0);
  const closedCount = Number(summary.closedCount || 0);
  const winRate = Number(summary.winRate || 0);

  return round(
    clamp(20 + Math.min(40, closedCount * 12) + Math.min(20, openCount * 6) + winRate * 20),
    1
  );
}

function buildTrackedAssetNote(row, tradeReadiness = null) {
  if (!row.inUniverse) {
    return `${row.ticker} is saved in your portfolio, but it is outside the monitored asset universe right now.`;
  }

  if (!row.action) {
    return `${row.ticker} is monitored, but the latest snapshot does not expose a live action for it yet.`;
  }

  if (!row.researchStatus) {
    return `${row.ticker} has a live ${row.action} view, but no linked research dossier is attached yet.`;
  }

  if (row.researchStatus !== "approved") {
    return `${row.ticker} has a live ${row.action} view, but research is only ${row.researchStatus}.`;
  }

  if (row.reviewStatus !== "approved" && row.action !== "HOLD") {
    return `${row.ticker} has approved research, but the ${row.action} still needs operator approval.`;
  }

  if (row.paperTradeStatus && row.action !== "HOLD") {
    return `${row.ticker} is already flowing through the paper-trade loop as ${row.paperTradeStatus}.`;
  }

  if (row.action === "HOLD") {
    return `${row.ticker} is covered and governed, but the desk is currently staying at HOLD.`;
  }

  if (tradeReadiness?.enabled && !tradeReadiness.ready) {
    return `${row.ticker} is governed, but real-world action is still blocked by the global trade-ready gate.`;
  }

  return `${row.ticker} is covered, governed, and ready for disciplined paper-trade follow-through.`;
}

function buildTrackedAssetRows({
  financialProfile = {},
  snapshot = null,
  researchDossiers = [],
  reviewItems = [],
  paperTradingState = null,
  tradeReadiness = null
} = {}) {
  const holdings = Array.isArray(financialProfile.holdings) ? financialProfile.holdings : [];
  const watchlist = new Set((financialProfile.watchlist || []).map((ticker) => normalizeTicker(ticker)).filter(Boolean));
  const trackedTickers = getTrackedTickers(financialProfile);
  const universeByTicker = new Map(monitoredUniverse.map((asset) => [normalizeTicker(asset.ticker), asset]));
  const holdingsByTicker = new Map(
    holdings.map((holding) => [normalizeTicker(holding.ticker), holding]).filter(([ticker]) => ticker)
  );
  const decisionsByTicker = buildDecisionMap(snapshot);
  const reviewsByTicker = buildReviewMap(reviewItems);
  const researchByTicker = buildResearchMap(researchDossiers);
  const paperTradesByTicker = buildPaperTradeMap(paperTradingState);
  const holdingsTotal = holdings.reduce((sum, holding) => sum + Number(holding.currentValue || 0), 0);

  return trackedTickers.map((ticker) => {
    const universeAsset = universeByTicker.get(ticker) || null;
    const holding = holdingsByTicker.get(ticker) || null;
    const decision = decisionsByTicker.get(ticker) || null;
    const review = reviewsByTicker.get(ticker) || null;
    const research = researchByTicker.get(ticker) || null;
    const paperTrade = paperTradesByTicker.get(ticker) || null;
    const researchStatus = normalizeResearchStatus(research?.status || "");
    const currentValue = Number(holding?.currentValue || 0);
    const row = {
      ticker,
      name: universeAsset?.name || holding?.label || ticker,
      bucket: universeAsset?.bucket || holding?.category || "",
      sourceLabel: holding && watchlist.has(ticker) ? "Holding + watchlist" : holding ? "Holding" : "Watchlist",
      inUniverse: Boolean(universeAsset),
      currentValue: round(currentValue, 2),
      weightRatio: holdingsTotal > 0 && currentValue > 0 ? round(currentValue / holdingsTotal, 4) : null,
      action: String(decision?.action || "").trim().toUpperCase(),
      confidence: Number(decision?.confidence || 0),
      horizon: String(decision?.horizon || "").trim(),
      summary: String(decision?.decisionMathSummary || decision?.rationale?.[0] || "").trim(),
      reviewStatus: String(review?.reviewStatus || "").trim().toLowerCase(),
      researchStatus,
      paperTradeStatus: String(paperTrade?.status || "").trim().toLowerCase(),
      actionable:
        ["BUY", "SELL"].includes(String(decision?.action || "").trim().toUpperCase()) &&
        researchStatus === "approved" &&
        String(review?.reviewStatus || "").trim().toLowerCase() === "approved"
    };

    return {
      ...row,
      note: buildTrackedAssetNote(row, tradeReadiness)
    };
  });
}

function buildAssessmentStatus({
  overallScore,
  trackedTickerCount,
  concentration,
  profileSummary,
  tradeReadiness
}) {
  if (!trackedTickerCount) {
    return "incomplete";
  }

  const liquidityCritical =
    Number(profileSummary.emergencyCoverageMonths || 0) <
    Math.max(2, Number(profileSummary.targetEmergencyFundMonths || 6) * 0.5);
  const liabilityRatio =
    Number(profileSummary.totalHoldingsValue || 0) > 0
      ? Number(profileSummary.totalLiabilitiesValue || 0) / Number(profileSummary.totalHoldingsValue || 1)
      : 0;
  const concentrationHigh = Number(concentration.largestHoldingWeightRatio || 0) > 0.5;

  if (liquidityCritical || liabilityRatio > 0.8 || concentrationHigh || overallScore < 45) {
    return "needs_attention";
  }

  if (!tradeReadiness?.ready || overallScore < 72) {
    return "mixed";
  }

  return "healthy";
}

function buildAssessmentHeadline(status) {
  if (status === "incomplete") {
    return "Portfolio setup is still too thin to assess intelligently.";
  }

  if (status === "needs_attention") {
    return "Portfolio needs attention before you trust new sizing decisions.";
  }

  if (status === "healthy") {
    return "Portfolio frame looks healthy and operationally disciplined.";
  }

  return "Portfolio is usable, but the desk still has clear weak spots.";
}

function buildAssessmentSummary({
  trackedTickerCount,
  coveredTrackedCount,
  actionableTrackedCount,
  concentration,
  profileSummary,
  tradeReadiness
}) {
  if (!trackedTickerCount) {
    return "Add holdings or a watchlist first so the desk can assess concentration, coverage, and governance against your real portfolio.";
  }

  const parts = [
    `${coveredTrackedCount}/${trackedTickerCount} tracked name${trackedTickerCount === 1 ? "" : "s"} are covered by the monitored desk.`,
    actionableTrackedCount
      ? `${actionableTrackedCount} tracked name${actionableTrackedCount === 1 ? "" : "s"} currently clear research plus approval governance.`
      : "No tracked name currently clears both research and approval governance.",
    concentration.largestHoldingWeightRatio != null
      ? `Largest listed holding is ${Math.round(concentration.largestHoldingWeightRatio * 100)}% of saved holdings.`
      : "Holding weights are not available yet.",
    Number(profileSummary.emergencyCoverageMonths || 0)
      ? `Emergency coverage is ${profileSummary.emergencyCoverageMonths} months versus a ${profileSummary.targetEmergencyFundMonths}-month target.`
      : "Emergency-fund coverage is not configured yet."
  ];

  if (tradeReadiness?.enabled && !tradeReadiness.ready) {
    parts.push(tradeReadiness.blockingGates?.[0]?.detail || "Trade-ready mode remains locked.");
  }

  return parts.join(" ");
}

export function buildPortfolioAssessment({
  snapshot = null,
  financialProfile = {},
  researchDossiers = [],
  reviewItems = [],
  paperTradingState = null,
  tradeReadiness = null
} = {}) {
  const trackedAssets = buildTrackedAssetRows({
    financialProfile,
    snapshot,
    researchDossiers,
    reviewItems,
    paperTradingState,
    tradeReadiness
  });
  const trackedTickerCount = trackedAssets.length;
  const coveredTrackedCount = trackedAssets.filter((asset) => asset.inUniverse).length;
  const liveDecisionCount = trackedAssets.filter((asset) => asset.action).length;
  const approvedResearchCount = trackedAssets.filter((asset) => asset.researchStatus === "approved").length;
  const pendingReviewCount = trackedAssets.filter(
    (asset) =>
      ["BUY", "SELL"].includes(asset.action) &&
      asset.reviewStatus === "proposed"
  ).length;
  const actionableTrackedCount = trackedAssets.filter((asset) => asset.actionable).length;
  const profileSummary = buildProfileSummary(financialProfile);
  const concentration = computeHoldingConcentration(financialProfile.holdings || []);
  const liabilityRatio =
    Number(profileSummary.totalHoldingsValue || 0) > 0
      ? round(profileSummary.totalLiabilitiesValue / profileSummary.totalHoldingsValue, 4)
      : null;
  const uncoveredTrackedCount = trackedTickerCount - coveredTrackedCount;
  const coverageScore = scoreCoverage({
    trackedTickerCount,
    coveredTrackedCount,
    liveDecisionCount
  });
  const governanceScore = scoreGovernance({
    trackedTickerCount,
    approvedResearchCount,
    actionableTrackedCount,
    pendingReviewCount
  });
  const liquidityScore = scoreLiquidity(profileSummary);
  const concentrationScore = scoreConcentration(concentration, financialProfile.holdings?.length || 0);
  const learningScore = scoreLearning(paperTradingState);
  const overallScore = round(
    coverageScore * 0.25 +
      governanceScore * 0.25 +
      liquidityScore * 0.2 +
      concentrationScore * 0.2 +
      learningScore * 0.1,
    1
  );
  const status = buildAssessmentStatus({
    overallScore,
    trackedTickerCount,
    concentration,
    profileSummary,
    tradeReadiness
  });
  const paperTradeSummary = paperTradingState?.summary || {};
  const strengths = [];
  const risks = [];
  const nextSteps = [];

  if (coveredTrackedCount && trackedTickerCount) {
    strengths.push(
      `${coveredTrackedCount}/${trackedTickerCount} tracked name${trackedTickerCount === 1 ? "" : "s"} sit inside the monitored universe.`
    );
  }

  if (
    Number(profileSummary.emergencyCoverageMonths || 0) >=
    Number(profileSummary.targetEmergencyFundMonths || 6)
  ) {
    strengths.push(
      `Emergency coverage sits at ${profileSummary.emergencyCoverageMonths} months versus a ${profileSummary.targetEmergencyFundMonths}-month target.`
    );
  }

  if (
    concentration.largestHoldingWeightRatio != null &&
    Number(concentration.largestHoldingWeightRatio || 0) <= 0.3 &&
    Number(financialProfile.holdings?.length || 0) > 1
  ) {
    strengths.push(
      `No single listed holding dominates the book; the largest position is ${Math.round(
        concentration.largestHoldingWeightRatio * 100
      )}%.`
    );
  }

  if (approvedResearchCount) {
    strengths.push(
      `${approvedResearchCount} tracked asset${approvedResearchCount === 1 ? "" : "s"} already have approved research dossiers.`
    );
  }

  if (Number(paperTradeSummary.closedCount || 0) > 0) {
    strengths.push(
      `The learning loop is active with ${paperTradeSummary.closedCount} closed paper trade${paperTradeSummary.closedCount === 1 ? "" : "s"}.`
    );
  }

  if (!trackedTickerCount) {
    risks.push("No holdings or watchlist names are saved yet.");
  }

  if (uncoveredTrackedCount > 0) {
    risks.push(
      `${uncoveredTrackedCount} tracked name${uncoveredTrackedCount === 1 ? "" : "s"} are outside monitored coverage or do not have a live desk action yet.`
    );
  }

  if (!approvedResearchCount && trackedTickerCount) {
    risks.push("No tracked asset currently has an approved research dossier.");
  }

  if (pendingReviewCount > 0) {
    risks.push(
      `${pendingReviewCount} tracked BUY or SELL call${pendingReviewCount === 1 ? "" : "s"} still need operator approval.`
    );
  }

  if (
    Number(profileSummary.emergencyCoverageMonths || 0) <
    Number(profileSummary.targetEmergencyFundMonths || 6)
  ) {
    risks.push(
      `Emergency coverage is ${profileSummary.emergencyCoverageMonths} months versus a ${profileSummary.targetEmergencyFundMonths}-month target.`
    );
  }

  if (concentration.largestHoldingWeightRatio != null && concentration.largestHoldingWeightRatio > 0.35) {
    risks.push(
      `Largest listed holding is ${Math.round(concentration.largestHoldingWeightRatio * 100)}% of saved holdings.`
    );
  }

  if (liabilityRatio != null && liabilityRatio > 0.35) {
    risks.push(
      `Listed liabilities are ${Math.round(liabilityRatio * 100)}% of listed holdings.`
    );
  }

  if (Number(paperTradeSummary.totalCount || 0) === 0) {
    risks.push("No paper-trade history exists yet, so sizing discipline is still unproven.");
  }

  if (tradeReadiness?.enabled && !tradeReadiness.ready) {
    risks.push(tradeReadiness.blockingGates?.[0]?.detail || "Trade-ready mode is still locked.");
  }

  if (!trackedTickerCount) {
    nextSteps.push("Add at least one holding or watchlist ticker in Portfolio first.");
  }

  if (uncoveredTrackedCount > 0) {
    nextSteps.push(
      "Either add uncovered tracked tickers to the monitored universe or stop expecting desk recommendations for them."
    );
  }

  if (approvedResearchCount < trackedTickerCount && trackedTickerCount) {
    nextSteps.push("Approve research dossiers for the tracked names you actually care about.");
  }

  if (pendingReviewCount > 0) {
    nextSteps.push("Resolve the pending BUY or SELL approvals in Decisions.");
  }

  if (
    actionableTrackedCount > 0 &&
    trackedAssets.some(
      (asset) =>
        asset.actionable &&
        !["planned", "open", "closed", "invalidated", "cancelled"].includes(asset.paperTradeStatus)
    )
  ) {
    nextSteps.push("Open paper trades for governed BUY or SELL ideas before trusting manual execution.");
  }

  if (
    Number(profileSummary.emergencyCoverageMonths || 0) <
    Number(profileSummary.targetEmergencyFundMonths || 6)
  ) {
    nextSteps.push("Favor liquidity rebuilding over aggressive adds until the safety buffer is back on target.");
  }

  if (concentration.largestHoldingWeightRatio != null && concentration.largestHoldingWeightRatio > 0.35) {
    nextSteps.push("Cap further size in the largest holding until the book is less concentrated.");
  }

  return {
    generatedAt: new Date().toISOString(),
    status,
    headline: buildAssessmentHeadline(status),
    summary: buildAssessmentSummary({
      trackedTickerCount,
      coveredTrackedCount,
      actionableTrackedCount,
      concentration,
      profileSummary,
      tradeReadiness
    }),
    scores: {
      overall: overallScore,
      coverage: coverageScore,
      governance: governanceScore,
      liquidity: liquidityScore,
      concentration: concentrationScore,
      learningLoop: learningScore
    },
    metrics: {
      trackedTickerCount,
      holdingsCount: Array.isArray(financialProfile.holdings) ? financialProfile.holdings.length : 0,
      watchlistCount: Array.isArray(financialProfile.watchlist) ? financialProfile.watchlist.length : 0,
      coveredTrackedCount,
      uncoveredTrackedCount,
      liveDecisionCount,
      approvedResearchCount,
      actionableTrackedCount,
      pendingReviewCount,
      totalHoldingsValue: profileSummary.totalHoldingsValue,
      totalLiabilitiesValue: profileSummary.totalLiabilitiesValue,
      liabilitiesToHoldingsRatio: liabilityRatio,
      emergencyCoverageMonths: profileSummary.emergencyCoverageMonths,
      targetEmergencyFundMonths: profileSummary.targetEmergencyFundMonths,
      monthlyBurn: profileSummary.monthlyBurn,
      largestHoldingWeightRatio: concentration.largestHoldingWeightRatio,
      topThreeWeightRatio: concentration.topThreeWeightRatio,
      decisionCoverageRatio: trackedTickerCount ? round(liveDecisionCount / trackedTickerCount, 4) : 0,
      approvedResearchCoverageRatio: trackedTickerCount
        ? round(approvedResearchCount / trackedTickerCount, 4)
        : 0,
      actionableCoverageRatio: trackedTickerCount
        ? round(actionableTrackedCount / trackedTickerCount, 4)
        : 0,
      paperTradeOpenCount: Number(paperTradeSummary.openCount || 0),
      paperTradeClosedCount: Number(paperTradeSummary.closedCount || 0),
      paperTradeWinRate: Number(paperTradeSummary.winRate || 0)
    },
    insights: {
      strengths: uniqueStrings(strengths).slice(0, 5),
      risks: uniqueStrings(risks).slice(0, 6),
      nextSteps: uniqueStrings(nextSteps).slice(0, 6)
    },
    tradeReadiness: tradeReadiness
      ? {
          ready: Boolean(tradeReadiness.ready),
          status: String(tradeReadiness.status || ""),
          blockingGate:
            tradeReadiness.blockingGates?.[0]?.detail ||
            tradeReadiness.actionRule ||
            ""
        }
      : null,
    trackedAssets
  };
}
