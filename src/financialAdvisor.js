import { monitoredUniverse } from "./data.js";
import { persistAdvisorAnswer } from "./advisorStore.js";
import { buildCurrentDecisionReviewState } from "./decisionReviewStore.js";
import { readFinancialProfile } from "./financialProfileStore.js";
import { requestStructuredResponse, resolveLlmConfig } from "./llmClient.js";
import { getLatestPipelineSnapshot } from "./pipelineStore.js";
import { listResearchDossiers } from "./researchStore.js";

const DEFAULT_ADVISOR_MODEL = "gpt-4.1-mini";
const REVIEW_READY_RESEARCH_STATUSES = new Set(["validated", "approved"]);
const ACTIONABLE_RESEARCH_STATUSES = new Set(["approved"]);

function formatDecisionMathSummary(decision) {
  if (!decision) {
    return null;
  }

  const thesisProbability = Number(decision.thesisProbability);
  const rewardRisk = Number(decision.rewardRisk);
  const maxLossGuardrail = Number(decision.maxLossGuardrail);

  if (
    !Number.isFinite(thesisProbability) ||
    !Number.isFinite(rewardRisk) ||
    !Number.isFinite(maxLossGuardrail)
  ) {
    return decision.decisionMathSummary || null;
  }

  return (
    decision.decisionMathSummary ||
    `${Math.round(thesisProbability * 100)}% thesis probability, ${rewardRisk.toFixed(
      1
    )}x reward/risk, ${decision.sizeBand || "watch"} size band, ${Math.round(
      maxLossGuardrail * 100
    )}% max-loss guardrail.`
  );
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

function getResearchStatusLabel(status) {
  const labels = {
    discovery: "research intake",
    candidate: "candidate",
    validated: "validated",
    approved: "approved",
    dismissed: "dismissed",
    expired: "expired",
    archived: "archived"
  };

  return labels[normalizeResearchStatus(status)] || "research intake";
}

function uniqueStrings(items) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function selectLinkedResearchDossier(assetTicker, dossiers = []) {
  const cleanTicker = String(assetTicker || "").trim().toUpperCase();

  return dossiers
    .filter((dossier) => (dossier.assets || []).includes(cleanTicker))
    .sort((left, right) => {
      const rankDifference =
        getResearchStatusRank(right?.status) - getResearchStatusRank(left?.status);

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return String(right?.updatedAt || "").localeCompare(String(left?.updatedAt || ""));
    })[0] || null;
}

function buildResearchGovernance(assetTicker, latestSnapshot, financialProfile = {}) {
  const linkedResearch = selectLinkedResearchDossier(
    assetTicker,
    listResearchDossiers({
      asset: assetTicker,
      limit: 20
    })
  );
  const reviewState = buildCurrentDecisionReviewState({
    snapshot: latestSnapshot,
    financialProfile
  });
  const decisionReview =
    reviewState.current.find((item) => item.asset === assetTicker) ||
    reviewState.queue.find((item) => item.asset === assetTicker) ||
    null;
  const researchStatus = normalizeResearchStatus(linkedResearch?.status);
  const reviewEligible = linkedResearch
    ? REVIEW_READY_RESEARCH_STATUSES.has(researchStatus)
    : false;
  const researchApproved = linkedResearch
    ? ACTIONABLE_RESEARCH_STATUSES.has(researchStatus)
    : false;
  const decisionApproved = decisionReview ? decisionReview.reviewStatus === "approved" : false;

  let blockingReason = "";

  if (!linkedResearch) {
    blockingReason = `No research dossier is linked to ${assetTicker} yet. Capture and validate research before treating this thesis as actionable.`;
  } else if (!reviewEligible) {
    blockingReason = `${linkedResearch.title || linkedResearch.theme || assetTicker} is still ${getResearchStatusLabel(
      researchStatus
    )}; validate the thesis before it enters the approval queue.`;
  } else if (!researchApproved) {
    blockingReason = `${linkedResearch.title || linkedResearch.theme || assetTicker} is validated but not thesis-approved yet, so the advisor should keep this watch-only.`;
  } else if (decisionReview && !decisionApproved) {
    blockingReason = `${assetTicker} still needs operator approval in the decision queue before it should be treated as investable.`;
  }

  return {
    linkedResearch,
    decisionReview,
    researchStatus,
    reviewEligible,
    researchApproved,
    decisionApproved,
    actionable: researchApproved && (!decisionReview || decisionApproved),
    blockingReason
  };
}

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

function getAssetContext(assetTicker, latestSnapshot, financialProfile = {}) {
  const asset = monitoredUniverse.find((item) => item.ticker === assetTicker) || null;
  const appData = latestSnapshot?.appData;
  const decision = appData?.decisions?.find((item) => item.asset === assetTicker) || null;
  const relatedClusters = (appData?.clusters || []).filter((cluster) => cluster.mappedAssets.includes(assetTicker));
  const relatedPosts = (appData?.posts || [])
    .filter((post) => post.mappedAssets.includes(assetTicker))
    .slice(0, 5);
  const researchGovernance = buildResearchGovernance(assetTicker, latestSnapshot, financialProfile);

  return {
    asset,
    decision,
    relatedClusters,
    relatedPosts,
    marketSummary: appData?.market?.summary || null,
    linkedResearch: researchGovernance.linkedResearch,
    decisionReview: researchGovernance.decisionReview,
    researchGovernance
  };
}

function findHolding(profile, assetTicker) {
  return profile.holdings.find((holding) => holding.ticker === assetTicker) || null;
}

function buildHeuristicAdvice({ assetTicker, question, profile, latestSnapshot }) {
  const profileSummary = summarizeProfile(profile);
  const assetContext = getAssetContext(assetTicker, latestSnapshot, profile);
  const holding = findHolding(profile, assetTicker);
  const decision = assetContext.decision;
  const researchGovernance = assetContext.researchGovernance;
  const decisionMathSummary = formatDecisionMathSummary(decision);
  const clusterContext = assetContext.relatedClusters[0]?.marketContext || "Cluster-level context is still being inferred from the current feed.";
  const bullishDecision = decision?.action === "BUY";
  const cautiousLiquidity = profileSummary.emergencyCoverageMonths < profile.targetEmergencyFundMonths;
  const leveragePressure = profileSummary.totalLiabilities > profileSummary.totalHoldings * 0.35;
  const rationale = [];

  if (researchGovernance.blockingReason) {
    rationale.push(researchGovernance.blockingReason);
  }

  if (decisionMathSummary) {
    rationale.push(decisionMathSummary);
  }

  rationale.push(
    decision?.rationale?.[0] ||
      `The current engine snapshot does not have a fresh direct call for ${assetTicker}.`
  );
  rationale.push(decision?.rationale?.[1] || clusterContext);
  rationale.push(
    holding
      ? `You already hold ${assetTicker} with roughly ${holding.currentValue.toFixed(0)} in current value, so concentration and timing matter.`
      : `You do not currently list a direct ${assetTicker} position, so any entry should be sized relative to your broader liquidity needs.`
  );
  const stance =
    leveragePressure || cautiousLiquidity || !researchGovernance.actionable
      ? "Research more"
      : bullishDecision
        ? "Accumulate"
        : decision?.action === "SELL"
          ? "Trim"
          : decision?.action === "HOLD"
            ? "Hold"
            : "Research more";
  const suitability =
    leveragePressure || cautiousLiquidity || !researchGovernance.actionable
      ? "Mixed fit"
      : bullishDecision && profile.riskTolerance !== "Conservative"
        ? "Good fit"
        : decision?.action === "SELL"
          ? "Poor fit"
          : "Mixed fit";
  const confidence =
    leveragePressure || cautiousLiquidity || !researchGovernance.actionable
      ? Math.min(decision?.confidence || 0.56, researchGovernance.reviewEligible ? 0.48 : 0.42)
      : decision?.confidence || 0.56;
  const governanceLead = researchGovernance.blockingReason
    ? `${researchGovernance.blockingReason} `
    : "";

  return {
    headline:
      !researchGovernance.actionable
        ? `${assetTicker}: Research more before acting`
        : `${assetTicker}: ${stance} with risk-aware sizing`,
    stance,
    suitability,
    confidence,
    answer:
      governanceLead +
      `Based on the latest internal signal stack, ${assetTicker} currently looks ${bullishDecision ? "constructive" : "mixed"} for your profile. ` +
      `The engine is weighing ${decision?.action || "WATCH"} signals, your ${profile.riskTolerance.toLowerCase()} risk tolerance, and your liquidity buffer before suggesting action. ` +
      (decisionMathSummary ? `Sizing math stays conservative: ${decisionMathSummary} ` : "") +
      `Question received: ${question.trim()}`,
    rationale,
    portfolioFit: [
      `Emergency-fund coverage is about ${profileSummary.emergencyCoverageMonths} months versus a ${profile.targetEmergencyFundMonths}-month target.`,
      `Total listed holdings are about ${profileSummary.totalHoldings.toFixed(0)} and liabilities about ${profileSummary.totalLiabilities.toFixed(0)}.`,
      `Risk tolerance is ${profile.riskTolerance} with a ${profile.investmentHorizon} horizon.`,
      assetContext.linkedResearch
        ? `Research status is ${getResearchStatusLabel(assetContext.linkedResearch.status)} with last update at ${assetContext.linkedResearch.updatedAt || "an unknown time"}.`
        : `No linked research dossier exists yet for ${assetTicker}.`
    ],
    riskFlags: [
      assetContext.asset?.riskFlag || `This asset can be volatile relative to a savings-first allocation.`,
      researchGovernance.blockingReason ||
        `${assetTicker} still needs explicit research and approval governance before it should be treated as actionable.`,
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
      assetContext.linkedResearch
        ? `Research dossier status: ${getResearchStatusLabel(assetContext.linkedResearch.status)}.`
        : "Research dossier status: missing.",
      assetContext.decisionReview
        ? `Decision review: ${assetContext.decisionReview.reviewStatus}.`
        : "Decision review is not approved yet.",
      decisionMathSummary || "No decision math is available yet, so the operator should treat this as watch-only sizing.",
      assetContext.relatedClusters[0]
        ? `Top cluster: ${assetContext.relatedClusters[0].title}.`
        : assetContext.marketSummary?.marketRegime
          ? `Current market regime: ${assetContext.marketSummary.marketRegime}.`
          : "Market regime is pending."
    ].slice(0, 5),
    nextSteps: [
      !assetContext.linkedResearch
        ? `Capture a research dossier for ${assetTicker} with supporting and contradicting evidence first.`
        : !researchGovernance.reviewEligible
          ? "Complete the evidence pack and validate the thesis before it reaches the queue."
          : !researchGovernance.researchApproved
            ? "Approve or dismiss the thesis in Research before treating it as investable."
            : assetContext.decisionReview && !researchGovernance.decisionApproved
              ? "Resolve the operator approval queue before changing position size."
              : "Check whether this position still fits after funding your target emergency reserve.",
      bullishDecision && researchGovernance.actionable
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
  const assetContext = getAssetContext(assetTicker, latestSnapshot, profile);
  const decisionMathSummary = formatDecisionMathSummary(assetContext.decision);

  return JSON.stringify(
    {
      question,
      assetTicker,
      profile,
      profileSummary,
      assetContext,
      decisionMathSummary,
      researchGovernance: assetContext.researchGovernance,
      instruction:
        "Answer conservatively. Use the profile, current signal stack, research governance, and decision math to provide decision-support, not guarantees. Respect liquidity, liabilities, risk tolerance, concentration, and the stated size band or guardrail. If research governance is incomplete, default to Research more or Hold and explain the gating reason."
    },
    null,
    2
  );
}

function enforceResearchGovernance(advice, assetContext, assetTicker) {
  const governance = assetContext?.researchGovernance;

  if (!governance || governance.actionable) {
    return advice;
  }

  const guidance = governance.blockingReason || `Research governance is incomplete for ${assetTicker}.`;

  return {
    ...advice,
    headline: `${assetTicker}: Research more before acting`,
    stance: "Research more",
    suitability: advice.suitability === "Good fit" ? "Mixed fit" : advice.suitability || "Mixed fit",
    confidence: Math.min(Number(advice.confidence) || 0.45, governance.reviewEligible ? 0.48 : 0.42),
    answer: `${guidance} ${advice.answer || ""}`.trim(),
    rationale: uniqueStrings([guidance, ...(advice.rationale || [])]).slice(0, 5),
    portfolioFit: uniqueStrings([
      ...(advice.portfolioFit || []),
      governance.linkedResearch
        ? `Research lifecycle is ${getResearchStatusLabel(governance.linkedResearch.status)}.`
        : `No linked research dossier exists for ${assetTicker}.`
    ]).slice(0, 4),
    riskFlags: uniqueStrings([guidance, ...(advice.riskFlags || [])]).slice(0, 5),
    latestSignals: uniqueStrings([
      governance.linkedResearch
        ? `Research dossier status: ${getResearchStatusLabel(governance.linkedResearch.status)}.`
        : "Research dossier status: missing.",
      governance.decisionReview
        ? `Decision review: ${governance.decisionReview.reviewStatus}.`
        : "Decision review is not approved yet.",
      ...(advice.latestSignals || [])
    ]).slice(0, 5),
    nextSteps: uniqueStrings([
      !governance.linkedResearch
        ? `Capture and validate a research dossier for ${assetTicker}.`
        : !governance.reviewEligible
          ? "Complete the evidence pack and validate the thesis before it enters the queue."
          : !governance.researchApproved
            ? "Approve or dismiss the thesis in Research before treating it as actionable."
            : "Resolve the operator approval queue before sizing a position.",
      "Keep any exposure watch-only until governance is complete.",
      ...(advice.nextSteps || [])
    ]).slice(0, 4)
  };
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
  const assetContext = getAssetContext(cleanTicker, latestSnapshot, profile);
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

  advice = enforceResearchGovernance(advice, assetContext, cleanTicker);
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
