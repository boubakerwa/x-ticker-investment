import { requestStructuredResponse, resolveLlmConfig } from "./llmClient.js";
import { resolvePolymarketOutcome } from "./polymarketProvider.js";

const DEFAULT_POLYMARKET_AGENT_MODEL = "gpt-4.1-mini";

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "selectedOutcome",
    "decision",
    "conviction",
    "estimatedProbability",
    "marketImpliedProbability",
    "edgePoints",
    "thesis",
    "timeHorizon",
    "sizeBand",
    "maxRiskUsd",
    "limitPrice",
    "rationale",
    "risks",
    "executionChecklist",
    "telegramSummary"
  ],
  properties: {
    headline: { type: "string" },
    selectedOutcome: { type: "string" },
    decision: {
      type: "string",
      enum: ["BUY", "WATCH_ONLY"]
    },
    conviction: {
      type: "number",
      minimum: 0,
      maximum: 1
    },
    estimatedProbability: {
      type: "number",
      minimum: 0,
      maximum: 1
    },
    marketImpliedProbability: {
      type: "number",
      minimum: 0,
      maximum: 1
    },
    edgePoints: {
      type: "number",
      minimum: -100,
      maximum: 100
    },
    thesis: { type: "string" },
    timeHorizon: { type: "string" },
    sizeBand: {
      type: "string",
      enum: ["watch", "tiny", "small", "medium"]
    },
    maxRiskUsd: {
      type: "number",
      minimum: 0,
      maximum: 100000
    },
    limitPrice: {
      type: "number",
      minimum: 0.001,
      maximum: 0.999
    },
    rationale: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" }
    },
    risks: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" }
    },
    executionChecklist: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" }
    },
    telegramSummary: { type: "string" }
  }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeOutcomeKey(value) {
  return normalizeText(value).toLowerCase();
}

function summarizeOperatorProfile(profile = {}) {
  return {
    investorName: String(profile.investorName || "").trim(),
    riskTolerance: String(profile.riskTolerance || "Moderate"),
    investmentHorizon: String(profile.investmentHorizon || ""),
    watchlist: Array.isArray(profile.watchlist) ? profile.watchlist.slice(0, 12) : [],
    holdings: Array.isArray(profile.holdings)
      ? profile.holdings.slice(0, 12).map((holding) => ({
          ticker: holding.ticker,
          currentValue: Number(holding.currentValue || 0)
        }))
      : [],
    monthlyNetIncome: Number(profile.monthlyNetIncome || 0),
    monthlyExpenses: Number(profile.monthlyExpenses || 0),
    emergencyFund: Number(profile.emergencyFund || 0),
    notes: String(profile.notes || "").trim()
  };
}

function normalizeAgentConfig() {
  const llmConfig = resolveLlmConfig({
    modelEnvVar: "POLYMARKET_AGENT_MODEL",
    localModelEnvVar: "LOCAL_LLM_MODEL",
    defaultModel: process.env.FINANCIAL_ADVISOR_MODEL || DEFAULT_POLYMARKET_AGENT_MODEL
  });

  return {
    activeMode:
      llmConfig.provider === "local_openai_compatible" || llmConfig.apiKey ? "openai" : "heuristic",
    provider: llmConfig.provider,
    apiKey: llmConfig.apiKey,
    baseUrl: llmConfig.baseUrl,
    model: llmConfig.model
  };
}

function detectNoteDirection(note) {
  const normalizedNote = normalizeText(note).toLowerCase();

  if (!normalizedNote) {
    return "neutral";
  }

  if (
    /\b(no|buy no|short|overpriced|too high|unlikely|won't|will not|fade)\b/.test(normalizedNote)
  ) {
    return "no";
  }

  if (
    /\b(yes|buy yes|underpriced|too low|likely|will happen|conviction|edge)\b/.test(normalizedNote)
  ) {
    return "yes";
  }

  return "neutral";
}

function pickPreferredOutcome(market, preferredOutcome) {
  return resolvePolymarketOutcome(market, preferredOutcome) || market?.outcomes?.[0] || null;
}

function buildHeuristicAnalysis({
  market,
  preferredOutcome = "",
  thesisNote = "",
  maxRiskUsd = 25
} = {}) {
  const selectedOutcome = pickPreferredOutcome(market, preferredOutcome);
  const selectedKey = normalizeOutcomeKey(selectedOutcome?.name);
  const noteDirection = detectNoteDirection(thesisNote);
  const alignedToOutcome =
    noteDirection === "neutral" ||
    !selectedKey ||
    (selectedKey.includes("yes") && noteDirection === "yes") ||
    (selectedKey.includes("no") && noteDirection === "no");
  const marketImpliedProbability = clamp(Number(selectedOutcome?.price || market?.displayProbability || 0), 0, 1);
  const directionalBump = normalizeText(thesisNote) ? (alignedToOutcome ? 0.05 : -0.05) : 0;
  const estimatedProbability = clamp(marketImpliedProbability + directionalBump, 0.01, 0.99);
  const edgePoints = round((estimatedProbability - marketImpliedProbability) * 100, 1);
  const buySignal = normalizeText(thesisNote) && alignedToOutcome && edgePoints >= 4;
  const cappedRisk = Math.max(0, Number(maxRiskUsd || 0));
  const decision = buySignal ? "BUY" : "WATCH_ONLY";
  const sizeBand = buySignal ? (edgePoints >= 8 ? "small" : "tiny") : "watch";

  return {
    headline: buySignal
      ? `${selectedOutcome?.name || "Outcome"} looks modestly underpriced`
      : "Watch-only until the thesis is stronger",
    selectedOutcome: selectedOutcome?.name || "",
    decision,
    conviction: buySignal ? 0.58 : 0.34,
    estimatedProbability: round(estimatedProbability, 4),
    marketImpliedProbability: round(marketImpliedProbability, 4),
    edgePoints,
    thesis: buySignal
      ? normalizeText(thesisNote) ||
        "The operator note points to a small mispricing, but this still needs disciplined sizing."
      : normalizeText(thesisNote) ||
        "There is not enough differentiated evidence here yet to justify a live Polymarket bet.",
    timeHorizon: market?.endDate ? `Until ${market.endDate}` : "Event-driven until resolution",
    sizeBand,
    maxRiskUsd: buySignal ? round(Math.min(cappedRisk || 25, 50), 2) : 0,
    limitPrice: round(selectedOutcome?.price || market?.displayProbability || 0.5, 4),
    rationale: [
      `Market price implies roughly ${Math.round(marketImpliedProbability * 100)}% for ${selectedOutcome?.name || "the selected outcome"}.`,
      buySignal
        ? "The operator note supports a small edge, so a tiny, capped-risk position is reasonable."
        : "Without stronger evidence, the safer call is to keep this watch-only instead of forcing a trade."
    ],
    risks: [
      "Prediction markets can move sharply on new headlines before fundamental confirmation exists.",
      "This heuristic fallback is intentionally conservative and should not be treated as a strong model edge."
    ],
    executionChecklist: [
      "Check geoblock eligibility before trying to place a live order.",
      "Use a limit order and cap total USDC at the configured max-risk amount."
    ],
    telegramSummary: buySignal
      ? `${market?.question}: BUY ${selectedOutcome?.name} at a small size.`
      : `${market?.question}: watch-only for now.`
  };
}

function buildPromptInput({
  market,
  preferredOutcome,
  thesisNote,
  maxRiskUsd,
  operatorProfile
}) {
  const selectedOutcome = pickPreferredOutcome(market, preferredOutcome);

  return JSON.stringify(
    {
      market: {
        id: market?.id,
        slug: market?.slug,
        question: market?.question,
        description: market?.description,
        eventTitle: market?.eventTitle,
        eventContext: market?.eventContext,
        endDate: market?.endDate,
        volume24hr: market?.volume24hr,
        liquidity: market?.liquidity,
        spread: market?.spread,
        bestBid: market?.bestBid,
        bestAsk: market?.bestAsk,
        lastTradePrice: market?.lastTradePrice,
        displayProbability: market?.displayProbability,
        displayPriceSource: market?.displayPriceSource,
        feesEnabled: market?.feesEnabled,
        orderMinSize: market?.orderMinSize,
        orderPriceMinTickSize: market?.orderPriceMinTickSize,
        outcomes: market?.outcomes || []
      },
      preferredOutcome: selectedOutcome?.name || "",
      operatorThesisNote: normalizeText(thesisNote),
      riskBudgetUsd: Number(maxRiskUsd || 0),
      operatorProfile: summarizeOperatorProfile(operatorProfile)
    },
    null,
    2
  );
}

export async function buildPolymarketBetAnalysis({
  market,
  preferredOutcome = "",
  thesisNote = "",
  maxRiskUsd = 25,
  operatorProfile = {}
} = {}) {
  const config = normalizeAgentConfig();
  const fallbackAnalysis = buildHeuristicAnalysis({
    market,
    preferredOutcome,
    thesisNote,
    maxRiskUsd
  });

  if (config.activeMode !== "openai") {
    return {
      ...fallbackAnalysis,
      agent: {
        activeMode: config.activeMode,
        provider: config.provider === "local_openai_compatible" ? "local-openai-compatible" : "heuristic",
        model: config.model
      }
    };
  }

  const instructions = `
You are the Polymarket bet-analysis agent inside a supervised investing desk.

Rules:
- Stay conservative. If the thesis note or market context is insufficient, return WATCH_ONLY.
- Do not invent external facts beyond the supplied market payload and operator note.
- Compare market-implied probability against your estimated probability.
- Prefer small size bands. Use "watch" when uncertain.
- Keep limitPrice realistic for a buy order and close to the current market price.
- maxRiskUsd must not exceed the operator-provided riskBudgetUsd unless that field is zero; if zero, stay under 25.
`.trim();

  try {
    const response = await requestStructuredResponse({
      config,
      instructions,
      inputText: buildPromptInput({
        market,
        preferredOutcome,
        thesisNote,
        maxRiskUsd,
        operatorProfile
      }),
      schema: analysisSchema,
      schemaName: "polymarket_bet_analysis",
      emptyOutputMessage: "The Polymarket agent returned an empty analysis.",
      requestErrorMessage: "The Polymarket agent request failed."
    });
    const parsed = JSON.parse(response.outputText);

    return {
      ...parsed,
      selectedOutcome:
        parsed.selectedOutcome ||
        pickPreferredOutcome(market, preferredOutcome)?.name ||
        fallbackAnalysis.selectedOutcome,
      limitPrice: round(parsed.limitPrice, 4),
      estimatedProbability: round(parsed.estimatedProbability, 4),
      marketImpliedProbability: round(parsed.marketImpliedProbability, 4),
      edgePoints: round(parsed.edgePoints, 1),
      maxRiskUsd: round(parsed.maxRiskUsd, 2),
      agent: {
        activeMode: config.activeMode,
        provider: config.provider === "local_openai_compatible" ? "local-openai-compatible" : "openai",
        model: config.model
      }
    };
  } catch (_error) {
    return {
      ...fallbackAnalysis,
      agent: {
        activeMode: "heuristic-fallback",
        provider: config.provider === "local_openai_compatible" ? "local-openai-compatible" : "openai",
        model: config.model
      }
    };
  }
}
