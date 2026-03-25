import { readFinancialProfile } from "./financialProfileStore.js";
import { sendNotification } from "./notificationProvider.js";
import {
  checkPolymarketGeoblock,
  getPolymarketMarket,
  getSafePolymarketConfig,
  listPolymarketMarkets,
  placePolymarketLimitOrder,
  resolvePolymarketOutcome
} from "./polymarketProvider.js";
import { buildPolymarketBetAnalysis } from "./polymarketAgent.js";
import {
  getPolymarketAnalysis,
  listPolymarketAnalyses,
  listPolymarketOrderAttempts,
  persistPolymarketAnalysis,
  persistPolymarketOrderAttempt
} from "./polymarketStore.js";
import {
  createRuntimeJob,
  markRuntimeJobCompleted,
  markRuntimeJobFailed,
  markRuntimeJobRunning
} from "./runtimeJobStore.js";

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function formatProbability(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${Math.round(numericValue * 100)}%` : "Pending";
}

function buildPolymarketSummary(analyses, orders) {
  const buyReadyCount = analyses.filter((analysis) => analysis.decision === "BUY").length;
  const submittedCount = orders.filter((order) => order.status === "submitted").length;
  const failedCount = orders.filter((order) => order.status === "failed").length;

  return {
    analysisCount: analyses.length,
    buyReadyCount,
    orderCount: orders.length,
    submittedCount,
    failedCount,
    lastAnalysisAt: analyses[0]?.createdAt || "",
    lastOrderAt: orders[0]?.createdAt || ""
  };
}

function computeRecommendedSize(limitPrice, maxRiskUsd, orderMinSize) {
  const numericPrice = Number(limitPrice);
  const numericRisk = Number(maxRiskUsd);
  const minimumSize = Number(orderMinSize || 0);

  if (!Number.isFinite(numericPrice) || numericPrice <= 0 || !Number.isFinite(numericRisk) || numericRisk <= 0) {
    return minimumSize || 0;
  }

  return round(Math.max(minimumSize || 0, numericRisk / numericPrice), 2);
}

async function resolveGeoblockState() {
  try {
    return {
      available: true,
      ...await checkPolymarketGeoblock()
    };
  } catch (error) {
    return {
      available: false,
      blocked: null,
      ip: "",
      country: "",
      region: "",
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Polymarket geoblock lookup failed."
    };
  }
}

function buildAnalysisNotificationMessage(analysis) {
  return {
    title: "Polymarket bet analysis",
    summary:
      analysis.decision === "BUY"
        ? `${analysis.question} -> BUY ${analysis.selectedOutcome} at ${formatProbability(analysis.limitPrice)}.`
        : `${analysis.question} -> watch-only for now.`,
    facts: [
      {
        label: "Outcome",
        value: analysis.selectedOutcome || "Pending"
      },
      {
        label: "Decision",
        value: analysis.decision
      },
      {
        label: "Market",
        value: formatProbability(analysis.marketImpliedProbability)
      },
      {
        label: "Estimate",
        value: formatProbability(analysis.estimatedProbability)
      },
      {
        label: "Edge",
        value: `${analysis.edgePoints > 0 ? "+" : ""}${analysis.edgePoints} pts`
      }
    ],
    highlights: analysis.rationale || [],
    footer: analysis.telegramSummary || "Review the Polymarket tab for the full setup."
  };
}

function buildOrderNotificationMessage(orderAttempt) {
  return {
    title:
      orderAttempt.status === "submitted"
        ? "Polymarket order submitted"
        : "Polymarket order failed",
    summary:
      orderAttempt.status === "submitted"
        ? `${orderAttempt.question} -> ${orderAttempt.side} ${orderAttempt.selectedOutcome} at ${formatProbability(
            orderAttempt.price
          )}.`
        : `${orderAttempt.question} -> ${orderAttempt.errorMessage || "Order failed."}`,
    facts: [
      {
        label: "Outcome",
        value: orderAttempt.selectedOutcome || "Pending"
      },
      {
        label: "Size",
        value: String(orderAttempt.size || 0)
      },
      {
        label: "Risk",
        value: `${round(orderAttempt.estimatedCost || 0, 2)} USDC`
      },
      {
        label: "Status",
        value: orderAttempt.status
      }
    ],
    footer:
      orderAttempt.providerOrderId
        ? `Provider order id: ${orderAttempt.providerOrderId}`
        : orderAttempt.errorMessage || "Review the Polymarket workspace for details."
  };
}

export function buildStoredPolymarketState() {
  const recentAnalyses = listPolymarketAnalyses(12);
  const recentOrders = listPolymarketOrderAttempts(16);

  return {
    config: getSafePolymarketConfig(),
    summary: buildPolymarketSummary(recentAnalyses, recentOrders),
    recentAnalyses,
    recentOrders
  };
}

export async function getPolymarketStatus() {
  return {
    ...buildStoredPolymarketState(),
    geoblock: await resolveGeoblockState()
  };
}

export async function getPolymarketMarkets(params = {}) {
  return listPolymarketMarkets(params);
}

export async function analyzePolymarketBet({
  marketId = "",
  marketSlug = "",
  preferredOutcome = "",
  thesisNote = "",
  maxRiskUsd = 25,
  trigger = "ui"
} = {}) {
  const job = createRuntimeJob({
    type: "polymarket.analysis",
    trigger,
    input: {
      marketId,
      marketSlug,
      preferredOutcome,
      maxRiskUsd
    }
  });

  markRuntimeJobRunning(job.id);

  try {
    const market = await getPolymarketMarket(marketId || marketSlug);
    const selectedOutcome = resolvePolymarketOutcome(market, preferredOutcome);
    const operatorProfile = readFinancialProfile();
    const analysisResult = await buildPolymarketBetAnalysis({
      market,
      preferredOutcome: selectedOutcome?.name || preferredOutcome,
      thesisNote,
      maxRiskUsd,
      operatorProfile
    });
    const persistedAnalysis = persistPolymarketAnalysis({
      id: analysisResult.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: analysisResult.decision === "BUY" ? "buy-ready" : "watch-only",
      marketId: market.id,
      marketSlug: market.slug,
      question: market.question,
      eventTitle: market.eventTitle,
      selectedOutcome: analysisResult.selectedOutcome || selectedOutcome?.name || "",
      decision: analysisResult.decision,
      conviction: analysisResult.conviction,
      estimatedProbability: analysisResult.estimatedProbability,
      marketImpliedProbability: analysisResult.marketImpliedProbability,
      edgePoints: analysisResult.edgePoints,
      thesis: analysisResult.thesis,
      timeHorizon: analysisResult.timeHorizon,
      sizeBand: analysisResult.sizeBand,
      maxRiskUsd: analysisResult.maxRiskUsd,
      limitPrice: analysisResult.limitPrice,
      recommendedSize:
        analysisResult.decision === "BUY"
          ? computeRecommendedSize(
              analysisResult.limitPrice,
              analysisResult.maxRiskUsd,
              market.orderMinSize
            )
          : 0,
      rationale: analysisResult.rationale,
      risks: analysisResult.risks,
      executionChecklist: analysisResult.executionChecklist,
      telegramSummary: analysisResult.telegramSummary,
      marketSnapshot: {
        id: market.id,
        slug: market.slug,
        question: market.question,
        eventTitle: market.eventTitle,
        outcomes: market.outcomes,
        liquidity: market.liquidity,
        volume24hr: market.volume24hr,
        spread: market.spread,
        bestBid: market.bestBid,
        bestAsk: market.bestAsk,
        lastTradePrice: market.lastTradePrice,
        displayProbability: market.displayProbability,
        displayPriceSource: market.displayPriceSource,
        feesEnabled: market.feesEnabled,
        orderMinSize: market.orderMinSize,
        orderPriceMinTickSize: market.orderPriceMinTickSize,
        negRisk: market.negRisk,
        url: market.url
      },
      operatorInput: {
        preferredOutcome: selectedOutcome?.name || "",
        thesisNote: String(thesisNote || "").trim(),
        maxRiskUsd: Number(maxRiskUsd || 0)
      },
      agent: analysisResult.agent || null
    });

    const notificationEvent = await sendNotification({
      eventType: "polymarket.analysis.created",
      message: buildAnalysisNotificationMessage(persistedAnalysis),
      payload: {
        analysisId: persistedAnalysis.id,
        marketId: persistedAnalysis.marketId
      }
    });

    markRuntimeJobCompleted(job.id, {
      output: {
        analysisId: persistedAnalysis.id,
        notificationId: notificationEvent?.id || ""
      }
    });

    return {
      jobId: job.id,
      analysis: persistedAnalysis,
      market,
      notificationEvent
    };
  } catch (error) {
    markRuntimeJobFailed(job.id, error);
    throw error;
  }
}

export async function placePolymarketOrder({
  analysisId = "",
  marketId = "",
  marketSlug = "",
  outcomeName = "",
  price,
  size,
  side = "BUY",
  orderType = "GTC",
  trigger = "ui"
} = {}) {
  const analysis = analysisId ? getPolymarketAnalysis(analysisId) : null;
  const job = createRuntimeJob({
    type: "polymarket.order",
    trigger,
    input: {
      analysisId,
      marketId,
      marketSlug,
      outcomeName,
      price,
      size,
      side,
      orderType
    }
  });

  markRuntimeJobRunning(job.id);

  const seedOrderAttempt = persistPolymarketOrderAttempt({
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    analysisId: analysis?.id || analysisId || "",
    marketId: marketId || analysis?.marketId || "",
    marketSlug: marketSlug || analysis?.marketSlug || "",
    question: analysis?.question || "",
    selectedOutcome: outcomeName || analysis?.selectedOutcome || "",
    side: String(side || "BUY").trim().toUpperCase(),
    orderType: String(orderType || "GTC").trim().toUpperCase(),
    price: Number(price || analysis?.limitPrice || 0),
    size: Number(size || analysis?.recommendedSize || 0),
    estimatedCost: round(Number(price || analysis?.limitPrice || 0) * Number(size || analysis?.recommendedSize || 0), 2),
    status: "pending",
    errorMessage: ""
  });

  try {
    const market = await getPolymarketMarket(seedOrderAttempt.marketId || seedOrderAttempt.marketSlug);
    const execution = await placePolymarketLimitOrder({
      marketId: market.id,
      outcomeName: seedOrderAttempt.selectedOutcome || analysis?.selectedOutcome || "",
      price: seedOrderAttempt.price,
      size: seedOrderAttempt.size,
      side: seedOrderAttempt.side,
      orderType: seedOrderAttempt.orderType
    });
    const completedOrderAttempt = persistPolymarketOrderAttempt({
      ...seedOrderAttempt,
      updatedAt: new Date().toISOString(),
      question: market.question,
      selectedOutcome: execution.outcome?.name || seedOrderAttempt.selectedOutcome,
      tokenId: execution.outcome?.tokenId || "",
      estimatedCost: execution.order.estimatedCost,
      status: "submitted",
      geoblock: execution.geoblock,
      providerStatus: String(execution.providerResponse?.status || ""),
      providerOrderId: String(execution.providerResponse?.orderID || execution.providerResponse?.orderId || ""),
      providerResponse: execution.providerResponse
    });
    const notificationEvent = await sendNotification({
      eventType: "polymarket.order.submitted",
      message: buildOrderNotificationMessage(completedOrderAttempt),
      payload: {
        orderId: completedOrderAttempt.id,
        analysisId: completedOrderAttempt.analysisId
      }
    });

    markRuntimeJobCompleted(job.id, {
      output: {
        orderId: completedOrderAttempt.id,
        notificationId: notificationEvent?.id || ""
      }
    });

    return {
      jobId: job.id,
      orderAttempt: completedOrderAttempt,
      market,
      notificationEvent
    };
  } catch (error) {
    const failedOrderAttempt = persistPolymarketOrderAttempt({
      ...seedOrderAttempt,
      updatedAt: new Date().toISOString(),
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Polymarket order failed."
    });

    await sendNotification({
      eventType: "polymarket.order.failed",
      message: buildOrderNotificationMessage(failedOrderAttempt),
      payload: {
        orderId: failedOrderAttempt.id,
        analysisId: failedOrderAttempt.analysisId
      }
    });

    markRuntimeJobFailed(job.id, error, {
      output: {
        orderId: failedOrderAttempt.id
      }
    });
    throw error;
  }
}
