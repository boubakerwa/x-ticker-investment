import { monitoredUniverse } from "./data.js";
import { persistAdvisorAnswer } from "./advisorStore.js";
import { readFinancialProfile } from "./financialProfileStore.js";
import { requestStructuredResponse, resolveLlmConfig } from "./llmClient.js";
import { getLatestPipelineSnapshot } from "./pipelineStore.js";

const DEFAULT_ADVISOR_MODEL = "gpt-4.1-mini";

const adviceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "stance",
    "suitability",
    "confidence",
    "answer",
    "rationale",
    "portfolioFit",
    "riskFlags",
    "latestSignals",
    "nextSteps",
    "disclaimer"
  ],
  properties: {
    headline: { type: "string" },
    stance: {
      type: "string",
      enum: ["Accumulate", "Hold", "Trim", "Avoid", "Research more"]
    },
    suitability: {
      type: "string",
      enum: ["Good fit", "Mixed fit", "Poor fit"]
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1
    },
    answer: { type: "string" },
    rationale: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 5
    },
    portfolioFit: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 4
    },
    riskFlags: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 5
    },
    latestSignals: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 5
    },
    nextSteps: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 4
    },
    disclaimer: { type: "string" }
  }
};

function normalizeAdvisorConfig() {
  const llmConfig = resolveLlmConfig({
    modelEnvVar: "FINANCIAL_ADVISOR_MODEL",
    localModelEnvVar: "LOCAL_LLM_MODEL",
    defaultModel: DEFAULT_ADVISOR_MODEL
  });

  return {
    activeMode: llmConfig.provider === "local_openai_compatible" || llmConfig.apiKey ? "openai" : "heuristic",
    provider: llmConfig.provider,
    apiKey: llmConfig.apiKey,
    baseUrl: llmConfig.baseUrl,
    model: llmConfig.model
  };
}

function formatProviderLabel(provider) {
  return provider === "local_openai_compatible" ? "local-openai-compatible" : "openai";
}

function summarizeProfile(profile) {
  const totalHoldings = profile.holdings.reduce((sum, item) => sum + Number(item.currentValue || 0), 0);
  const totalLiabilities = profile.liabilities.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const monthlyBurn = Math.max(0, Number(profile.monthlyExpenses || 0) - Number(profile.monthlyNetIncome || 0));
  const emergencyCoverageMonths =
    Number(profile.monthlyExpenses || 0) > 0
      ? Number((Number(profile.emergencyFund || 0) / Number(profile.monthlyExpenses || 1)).toFixed(1))
      : 0;

  return {
    totalHoldings: Number(totalHoldings.toFixed(2)),
    totalLiabilities: Number(totalLiabilities.toFixed(2)),
    netInvestableCapital: Number((totalHoldings - totalLiabilities).toFixed(2)),
    monthlyBurn: Number(monthlyBurn.toFixed(2)),
    emergencyCoverageMonths
  };
}

function getAssetContext(assetTicker, latestSnapshot) {
  const asset = monitoredUniverse.find((item) => item.ticker === assetTicker) || null;
  const appData = latestSnapshot?.appData;
  const decision = appData?.decisions?.find((item) => item.asset === assetTicker) || null;
  const relatedClusters = (appData?.clusters || []).filter((cluster) => cluster.mappedAssets.includes(assetTicker));
  const relatedPosts = (appData?.posts || [])
    .filter((post) => post.mappedAssets.includes(assetTicker))
    .slice(0, 5);

  return {
    asset,
    decision,
    relatedClusters,
    relatedPosts,
    marketSummary: appData?.market?.summary || null
  };
}

function findHolding(profile, assetTicker) {
  return profile.holdings.find((holding) => holding.ticker === assetTicker) || null;
}

function buildHeuristicAdvice({ assetTicker, question, profile, latestSnapshot }) {
  const profileSummary = summarizeProfile(profile);
  const assetContext = getAssetContext(assetTicker, latestSnapshot);
  const holding = findHolding(profile, assetTicker);
  const decision = assetContext.decision;
  const bullishDecision = decision?.action === "BUY";
  const cautiousLiquidity = profileSummary.emergencyCoverageMonths < profile.targetEmergencyFundMonths;
  const leveragePressure = profileSummary.totalLiabilities > profileSummary.totalHoldings * 0.35;
  const stance = leveragePressure || cautiousLiquidity
    ? "Research more"
    : bullishDecision
      ? "Accumulate"
      : decision?.action === "SELL"
        ? "Trim"
        : decision?.action === "HOLD"
          ? "Hold"
          : "Research more";
  const suitability =
    leveragePressure || cautiousLiquidity
      ? "Mixed fit"
      : bullishDecision && profile.riskTolerance !== "Conservative"
        ? "Good fit"
        : decision?.action === "SELL"
          ? "Poor fit"
          : "Mixed fit";

  return {
    headline: `${assetTicker}: ${stance} with risk-aware sizing`,
    stance,
    suitability,
    confidence: decision?.confidence || 0.56,
    answer:
      `Based on the latest internal signal stack, ${assetTicker} currently looks ${bullishDecision ? "constructive" : "mixed"} for your profile. ` +
      `The engine is weighing ${decision?.action || "WATCH"} signals, your ${profile.riskTolerance.toLowerCase()} risk tolerance, and your liquidity buffer before suggesting action. ` +
      `Question received: ${question.trim()}`,
    rationale: [
      decision?.rationale?.[0] || `The current engine snapshot does not have a fresh direct call for ${assetTicker}.`,
      assetContext.relatedClusters[0]?.marketContext || "Cluster-level context is still being inferred from the current feed.",
      holding
        ? `You already hold ${assetTicker} with roughly ${holding.currentValue.toFixed(0)} in current value, so concentration and timing matter.`
        : `You do not currently list a direct ${assetTicker} position, so any entry should be sized relative to your broader liquidity needs.`
    ],
    portfolioFit: [
      `Emergency-fund coverage is about ${profileSummary.emergencyCoverageMonths} months versus a ${profile.targetEmergencyFundMonths}-month target.`,
      `Total listed holdings are about ${profileSummary.totalHoldings.toFixed(0)} and liabilities about ${profileSummary.totalLiabilities.toFixed(0)}.`,
      `Risk tolerance is ${profile.riskTolerance} with a ${profile.investmentHorizon} horizon.`
    ],
    riskFlags: [
      assetContext.asset?.riskFlag || `This asset can be volatile relative to a savings-first allocation.`,
      cautiousLiquidity
        ? "Your stated emergency-fund buffer is below the target, so aggressive sizing would be premature."
        : "Keep position sizing consistent with the rest of your balance sheet.",
      leveragePressure
        ? "Liabilities are material relative to your holdings, which lowers the margin for speculative adds."
        : "Macro or policy shifts could still reverse recent signal strength quickly."
    ],
    latestSignals: [
      decision
        ? `${assetTicker} is currently marked ${decision.action} at ${Math.round(decision.confidence * 100)}% confidence.`
        : `No direct active recommendation is currently published for ${assetTicker}.`,
      assetContext.relatedClusters[0]
        ? `Top cluster: ${assetContext.relatedClusters[0].title}.`
        : "No cluster currently dominates this asset.",
      assetContext.marketSummary?.marketRegime
        ? `Current market regime: ${assetContext.marketSummary.marketRegime}.`
        : "Market regime is pending."
    ],
    nextSteps: [
      "Check whether this position still fits after funding your target emergency reserve.",
      bullishDecision
        ? "If you add, prefer staged entries rather than a single full-size buy."
        : "Wait for a cleaner catalyst or improved signal confirmation before changing size.",
      "Re-run the advisor after the next pipeline refresh if the question is event-driven."
    ],
    disclaimer:
      "This is educational decision support built from your saved profile plus the latest local signal snapshot; it is not tax, legal, or fiduciary advice."
  };
}

function buildAdvisorPrompt({ assetTicker, question, profile, latestSnapshot }) {
  const profileSummary = summarizeProfile(profile);
  const assetContext = getAssetContext(assetTicker, latestSnapshot);

  return JSON.stringify(
    {
      question,
      assetTicker,
      profile,
      profileSummary,
      assetContext,
      instruction:
        "Answer conservatively. Use the profile and current signal stack to provide decision-support, not guarantees. Respect liquidity, liabilities, risk tolerance, and concentration."
    },
    null,
    2
  );
}

async function runModelAdvice({ assetTicker, question, profile, latestSnapshot, config }) {
  const response = await requestStructuredResponse({
    config,
    instructions:
      "You are a conservative financial decision-support analyst. Use the user's holdings, liabilities, liquidity, and the provided latest signals to answer a specific asset question. Never claim certainty, never promise returns, and keep the answer grounded in the supplied data only.",
    inputText: buildAdvisorPrompt({
      assetTicker,
      question,
      profile,
      latestSnapshot
    }),
    schema: adviceSchema,
    schemaName: "financial_advice_answer",
    emptyOutputMessage: "Advisor response did not include structured output.",
    requestErrorMessage: "Advisor request failed."
  });

  return JSON.parse(response.outputText);
}

export async function answerFinancialQuestion({ assetTicker, question, profileInput = null }) {
  const cleanTicker = String(assetTicker || "").trim().toUpperCase();
  const cleanQuestion = String(question || "").trim();

  if (!cleanTicker) {
    throw new Error("An asset ticker is required.");
  }

  if (!cleanQuestion) {
    throw new Error("A question is required.");
  }

  const latestSnapshot = getLatestPipelineSnapshot();

  if (!latestSnapshot) {
    throw new Error("No pipeline snapshot is available yet.");
  }

  const profile = profileInput || readFinancialProfile();
  const config = normalizeAdvisorConfig();
  let advice;
  let provider = "heuristic";

  if (config.activeMode === "openai") {
    try {
      advice = await runModelAdvice({
        assetTicker: cleanTicker,
        question: cleanQuestion,
        profile,
        latestSnapshot,
        config
      });
      provider = formatProviderLabel(config.provider);
    } catch (_error) {
      advice = buildHeuristicAdvice({
        assetTicker: cleanTicker,
        question: cleanQuestion,
        profile,
        latestSnapshot
      });
      provider = `${formatProviderLabel(config.provider)}-heuristic-fallback`;
    }
  } else {
    advice = buildHeuristicAdvice({
      assetTicker: cleanTicker,
      question: cleanQuestion,
      profile,
      latestSnapshot
    });
  }

  const assetContext = getAssetContext(cleanTicker, latestSnapshot);
  const response = persistAdvisorAnswer({
    assetTicker: cleanTicker,
    status: "completed",
    provider,
    question: cleanQuestion,
    snapshotGeneratedAt: latestSnapshot.generatedAt,
    assetName: assetContext.asset?.name || cleanTicker,
    answer: advice
  });

  return response;
}
