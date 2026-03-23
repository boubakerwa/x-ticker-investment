import { monitoredUniverse, clusters as seedClusters } from "./data.js";
import { formatBerlinTimestamp } from "./fakeTweetGenerator.js";
import { extractClaimsForPosts } from "./modelClaimExtractor.js";

const seedClusterMap = new Map(seedClusters.map((cluster) => [cluster.id, cluster]));
const universeTickers = monitoredUniverse.map((asset) => asset.ticker);
const universeIndex = new Map(universeTickers.map((ticker, index) => [ticker, index]));
const clusterPriority = [
  "cluster-accelerators",
  "cluster-enterprise-ai",
  "cluster-policy-noise",
  "cluster-crypto-risk"
];

const clusterConfig = {
  "cluster-accelerators": {
    keywords: [
      "accelerator",
      "accelerators",
      "gpu",
      "gpus",
      "nvidia",
      "rack",
      "racks",
      "server",
      "servers",
      "hyperscaler",
      "hyperscalers",
      "capex",
      "compute",
      "semiconductor",
      "semis",
      "semi",
      "foundry",
      "data center",
      "datacenter",
      "odm",
      "supply chain",
      "cooling"
    ],
    themeLexicon: {
      "AI accelerators": ["accelerator", "gpu", "gpus", "nvidia", "compute"],
      "Hyperscaler capex": ["hyperscaler", "hyperscalers", "capex", "budget", "deployment"],
      "Supply chain": ["supply chain", "odm", "foundry", "component", "components", "cooling"],
      "Data center buildout": ["rack", "racks", "server", "servers", "data center", "datacenter"]
    },
    sourceBias: {
      "src-semiflow": 4,
      "src-policywire": 2,
      "src-macrolens": 1
    },
    defaultAssets: ["NVDA", "TSM", "SOXX", "QQQ"],
    marketContext:
      "Semis remain the cleanest expression when infrastructure-demand narratives are broadening and fresh.",
    policyOutcome: "Eligible",
    title:
      seedClusterMap.get("cluster-accelerators")?.title ||
      "AI infrastructure demand is holding firmer than feared"
  },
  "cluster-enterprise-ai": {
    keywords: [
      "enterprise",
      "copilot",
      "copilots",
      "assistant",
      "assistants",
      "budget",
      "budgets",
      "roi",
      "workflow",
      "seat",
      "seats",
      "monetization",
      "software",
      "buyers",
      "pilot",
      "pilots",
      "deployment",
      "cio",
      "customer"
    ],
    themeLexicon: {
      "Enterprise AI": ["enterprise", "copilot", "copilots", "assistant", "assistants"],
      "Monetization": ["monetization", "budget", "budgets", "roi", "seat", "seats"],
      "Workflow adoption": ["workflow", "usage", "deployment", "pilot", "pilots", "customer"],
      "Software demand": ["software", "buyers", "platform", "team", "teams"]
    },
    sourceBias: {
      "src-builderalpha": 4,
      "src-macrolens": 1
    },
    defaultAssets: ["MSFT", "META", "QQQ"],
    marketContext:
      "Enterprise AI interest is improving, but the engine still demands proof that curiosity is turning into durable monetization.",
    policyOutcome: "Hold bias",
    title:
      seedClusterMap.get("cluster-enterprise-ai")?.title ||
      "Enterprise AI demand improved, but monetization still needs proof"
  },
  "cluster-policy-noise": {
    keywords: [
      "policy",
      "guidance",
      "export",
      "hearing",
      "proposal",
      "procurement",
      "committee",
      "regulation",
      "regulatory",
      "rumor",
      "headline",
      "clarification",
      "clarified",
      "verification",
      "confirmed",
      "draft",
      "freeze",
      "noise",
      "narrative"
    ],
    themeLexicon: {
      "Policy noise": ["policy", "guidance", "export", "regulation", "regulatory"],
      "Verification": ["verification", "confirmed", "clarification", "clarified", "draft"],
      "Narrative reset": ["rumor", "headline", "noise", "narrative", "freeze"],
      "Procurement headlines": ["procurement", "committee", "proposal", "hearing"]
    },
    sourceBias: {
      "src-policywire": 5,
      "src-macrolens": 2
    },
    defaultAssets: ["AMD", "QQQ"],
    marketContext:
      "The policy layer treats fast headline cycles as noise until the source stack turns into actual operating language.",
    policyOutcome: "Vetoed",
    title:
      seedClusterMap.get("cluster-policy-noise")?.title ||
      "Policy headline looked tradable but resolved as noise"
  },
  "cluster-crypto-risk": {
    keywords: [
      "btc",
      "bitcoin",
      "crypto",
      "spot",
      "perp",
      "perps",
      "derivatives",
      "liquidity",
      "leverage",
      "funding",
      "volatility",
      "token",
      "risk appetite"
    ],
    themeLexicon: {
      BTC: ["btc", "bitcoin", "crypto"],
      Liquidity: ["liquidity", "risk appetite", "macro", "flow"],
      "Derivatives positioning": ["perp", "perps", "derivatives", "funding", "leverage"],
      Volatility: ["volatility", "crowded", "messy"]
    },
    sourceBias: {
      "src-chainpulse": 5,
      "src-macrolens": 1
    },
    defaultAssets: ["BTC", "QQQ"],
    marketContext:
      "Crypto can participate in a risk bid, but the policy engine keeps evidence thresholds higher when leverage looks crowded.",
    policyOutcome: "Eligible but cautious",
    title:
      seedClusterMap.get("cluster-crypto-risk")?.title ||
      "Crypto is participating in the risk bid, but the trigger is messy"
  }
};

const claimTypeBySource = {
  "src-policywire": {
    primary: "Policy interpretation",
    clarifier: "Debunk / clarification"
  },
  "src-semiflow": {
    primary: "Channel check",
    clarifier: "Supply chain read"
  },
  "src-macrolens": {
    primary: "Macro context",
    clarifier: "Macro context"
  },
  "src-builderalpha": {
    primary: "Operator commentary",
    clarifier: "Operator commentary"
  },
  "src-chainpulse": {
    primary: "Market desk note",
    clarifier: "Market desk note"
  }
};

const sourceDefaults = {
  category: "Operator / Custom",
  baselineReliability: 0.6,
  preferredHorizon: "2-7 days",
  policyTemplate: "Custom operator source",
  relevantSectors: [],
  allowedAssets: universeTickers,
  specialHandling: "",
  tone: "Custom",
  lastActive: ""
};

const allowedClaimTypes = [
  "Policy interpretation",
  "Debunk / clarification",
  "Channel check",
  "Supply chain read",
  "Macro context",
  "Operator commentary",
  "Market desk note"
];

const allowedDirections = ["Bullish", "Mixed", "Neutral", "Bearish"];
const allowedExplicitness = ["Explicit", "Interpretive"];

const bullishKeywords = [
  "firm",
  "firmer",
  "strong",
  "stronger",
  "supportive",
  "improved",
  "improving",
  "continuation",
  "leading",
  "resilience",
  "resilient",
  "pulling forward",
  "positive",
  "upside",
  "broadening",
  "constructive",
  "better"
];

const bearishKeywords = [
  "roll over",
  "slowdown",
  "fade",
  "fading",
  "downgrade",
  "weak",
  "weaker",
  "negative",
  "decline",
  "air pocket",
  "shock",
  "freeze",
  "lagging"
];

const neutralKeywords = [
  "no confirmed",
  "no hard language",
  "clarification",
  "clarified",
  "noise",
  "rumor",
  "headline",
  "verification",
  "narrative-driven"
];

const cautionKeywords = [
  "but",
  "though",
  "still",
  "not enough",
  "messy",
  "mixed",
  "lumpy",
  "partial",
  "wait",
  "crowded",
  "uneven",
  "gating",
  "proof",
  "not yet"
];

const interpretiveKeywords = [
  "looks",
  "implies",
  "usually",
  "could",
  "may",
  "closer to",
  "appears",
  "leans",
  "argues for"
];

const noiseKeywords = [
  "noise",
  "rumor",
  "headline",
  "verification",
  "clarification",
  "until the paper trail improves",
  "not enough documentary support"
];

const operationalPolicyKeywords = [
  "narrower than feared",
  "broad stop sign",
  "not a broad stop sign",
  "move up, not down",
  "move up",
  "infrastructure spending",
  "data-center demand",
  "data center demand",
  "operating language",
  "ai infrastructure spending",
  "ai compute"
];

const assetKeywordMap = {
  NVDA: ["nvda", "nvidia", "accelerator", "gpu", "gpus", "compute"],
  AMD: ["amd"],
  TSM: ["tsm", "foundry", "odm", "assembly", "manufacturing"],
  MSFT: ["msft", "microsoft", "copilot", "enterprise", "workflow"],
  META: ["meta", "llama", "ads", "consumer ai"],
  SOXX: ["semi", "semis", "semiconductor", "semiconductors", "supply chain"],
  QQQ: ["qqq", "broad tech", "growth", "software"],
  BTC: ["btc", "bitcoin", "crypto", "spot", "perp", "perps", "derivatives"]
};

const assetWeightByCluster = {
  "cluster-accelerators": {
    NVDA: 1,
    TSM: 0.84,
    SOXX: 0.9,
    QQQ: 0.56
  },
  "cluster-enterprise-ai": {
    MSFT: 0.88,
    META: 0.6,
    QQQ: 0.58
  },
  "cluster-policy-noise": {
    AMD: 1,
    QQQ: 0.5
  },
  "cluster-crypto-risk": {
    BTC: 1,
    QQQ: 0.22
  }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Number(value.toFixed(2));
}

function sortByDateDescending(items) {
  return [...items].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function formatRelativeWindow(oldestPostAt, generatedAt) {
  const oldestTime = new Date(oldestPostAt).getTime();
  const generatedTime = new Date(generatedAt).getTime();

  if (!Number.isFinite(oldestTime) || !Number.isFinite(generatedTime)) {
    return "Last 3 days";
  }

  const hours = Math.max(1, Math.round((generatedTime - oldestTime) / (60 * 60 * 1000)));

  if (hours >= 48) {
    return `Last ${Math.ceil(hours / 24)} days`;
  }

  return `Last ${hours} hours`;
}

function uniqueSorted(items) {
  return [...new Set(items.filter(Boolean))].sort(
    (left, right) => (universeIndex.get(left) ?? 999) - (universeIndex.get(right) ?? 999)
  );
}

function countMatches(haystack, keywords) {
  return keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0);
}

function hasOperationalPolicyShift(bodyLower) {
  return (
    countMatches(bodyLower, operationalPolicyKeywords) >= 2 &&
    countMatches(bodyLower, clusterConfig["cluster-accelerators"].keywords) >= 1 &&
    countMatches(bodyLower, neutralKeywords) === 0 &&
    countMatches(bodyLower, noiseKeywords) === 0
  );
}

function hasPolicyNoiseSignal(bodyLower) {
  return countMatches(bodyLower, [...neutralKeywords, ...noiseKeywords]) >= 1;
}

function getSourceProfile(source) {
  return {
    ...sourceDefaults,
    ...(source || {})
  };
}

function pickClusterId(rawPost, source, bodyLower) {
  const operationalPolicyShift = source.id === "src-policywire" && hasOperationalPolicyShift(bodyLower);
  const policyNoiseSignal = source.id === "src-policywire" && hasPolicyNoiseSignal(bodyLower);
  const scoredClusters = clusterPriority.map((clusterId) => {
    const config = clusterConfig[clusterId];
    const keywordScore = countMatches(bodyLower, config.keywords);
    const themeScore = countMatches(
      (Array.isArray(rawPost.themes) ? rawPost.themes.join(" ").toLowerCase() : ""),
      config.keywords
    );
    const mappedAssetScore = (Array.isArray(rawPost.mappedAssets) ? rawPost.mappedAssets : []).reduce(
      (sum, asset) => sum + (config.defaultAssets.includes(asset) ? 1 : 0),
      0
    );
    const sourceScore = config.sourceBias[source.id] || 0;
    const priorScore = rawPost.clusterId === clusterId ? 1 : 0;
    let score = keywordScore * 2 + themeScore + mappedAssetScore + sourceScore + priorScore;

    if (clusterId === "cluster-accelerators" && operationalPolicyShift) {
      score += 6;
    }

    if (clusterId === "cluster-policy-noise" && policyNoiseSignal && !operationalPolicyShift) {
      score += 4;
    }

    if (clusterId === "cluster-policy-noise" && operationalPolicyShift) {
      score -= 4;
    }

    return {
      clusterId,
      score
    };
  });

  scoredClusters.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return clusterPriority.indexOf(left.clusterId) - clusterPriority.indexOf(right.clusterId);
  });

  return scoredClusters[0]?.clusterId || "cluster-enterprise-ai";
}

function deriveClaimType(source, bodyLower, clusterId) {
  const sourceType = claimTypeBySource[source.id] || {
    primary: "Operator commentary",
    clarifier: "Operator commentary"
  };

  if (clusterId === "cluster-policy-noise" || countMatches(bodyLower, neutralKeywords) > 0) {
    return sourceType.clarifier;
  }

  if (source.id === "src-semiflow" && (bodyLower.includes("supply chain") || bodyLower.includes("component"))) {
    return sourceType.clarifier;
  }

  return sourceType.primary;
}

function deriveDirection(bodyLower, clusterId) {
  const bullishScore = countMatches(bodyLower, bullishKeywords);
  const bearishScore = countMatches(bodyLower, bearishKeywords);
  const neutralScore = countMatches(bodyLower, neutralKeywords);
  const cautionScore = countMatches(bodyLower, cautionKeywords);

  if (clusterId === "cluster-policy-noise" && neutralScore > 0) {
    return "Neutral";
  }

  if (bullishScore >= bearishScore + 2 && cautionScore <= 1) {
    return "Bullish";
  }

  if (bearishScore >= bullishScore + 2 && neutralScore === 0) {
    return "Bearish";
  }

  if (neutralScore > bullishScore && neutralScore >= 1) {
    return "Neutral";
  }

  if (clusterId === "cluster-crypto-risk") {
    return cautionScore >= 1 ? "Mixed" : "Bullish";
  }

  if (clusterId === "cluster-enterprise-ai") {
    return cautionScore >= 1 ? "Mixed" : "Bullish";
  }

  if (clusterId === "cluster-accelerators") {
    if (hasOperationalPolicyShift(bodyLower)) {
      return "Bullish";
    }

    return bullishScore > 0 ? "Bullish" : "Mixed";
  }

  return cautionScore >= 1 ? "Mixed" : "Bullish";
}

function deriveExplicitness(bodyLower) {
  return countMatches(bodyLower, interpretiveKeywords) > 0 ? "Interpretive" : "Explicit";
}

function deriveThemes(clusterId, bodyLower, rawPost) {
  const config = clusterConfig[clusterId];
  const matchedThemes = Object.entries(config.themeLexicon)
    .filter(([, keywords]) => countMatches(bodyLower, keywords) > 0)
    .map(([theme]) => theme);

  if (matchedThemes.length) {
    return matchedThemes.slice(0, 3);
  }

  if (Array.isArray(rawPost.themes) && rawPost.themes.length) {
    return rawPost.themes.slice(0, 3);
  }

  return Object.keys(config.themeLexicon).slice(0, 3);
}

function deriveMappedAssets(clusterId, bodyLower, source, rawPost) {
  const config = clusterConfig[clusterId];
  const allowedAssets = Array.isArray(source.allowedAssets) && source.allowedAssets.length
    ? source.allowedAssets
    : universeTickers;
  const clusterAllowedAssets = config.defaultAssets.filter((ticker) => allowedAssets.includes(ticker));
  const directMatches = Object.entries(assetKeywordMap)
    .filter(([, keywords]) => countMatches(bodyLower, keywords) > 0)
    .map(([ticker]) => ticker)
    .filter((ticker) => clusterAllowedAssets.includes(ticker));
  const hintedAssets = Array.isArray(rawPost.mappedAssets)
    ? rawPost.mappedAssets.filter((ticker) => clusterAllowedAssets.includes(ticker))
    : [];
  const fallbackAssets = clusterAllowedAssets;

  return uniqueSorted([...directMatches, ...hintedAssets, ...fallbackAssets]).slice(0, 4);
}

function deriveActionable(bodyLower, clusterId, direction) {
  if (clusterId === "cluster-policy-noise") {
    return false;
  }

  if (direction === "Neutral") {
    return false;
  }

  return countMatches(bodyLower, noiseKeywords) === 0;
}

function deriveConfidence({ clusterId, source, direction, explicitness, actionable, bodyLower, createdAt, generatedAt }) {
  const hoursOld = Math.max(0, (new Date(generatedAt).getTime() - new Date(createdAt).getTime()) / (60 * 60 * 1000));
  const freshnessBoost = hoursOld <= 12 ? 0.07 : hoursOld <= 36 ? 0.04 : 0.01;
  const reliabilityScore = source.baselineReliability * 0.32;
  const clusterSignal = Math.min(0.12, countMatches(bodyLower, clusterConfig[clusterId].keywords) * 0.02);
  const directionBoost =
    direction === "Bullish" || direction === "Bearish"
      ? 0.05
      : direction === "Mixed"
        ? 0.01
        : -0.03;
  const explicitnessBoost = explicitness === "Explicit" ? 0.03 : 0;
  const actionableBoost = actionable ? 0.03 : -0.06;

  return round(
    clamp(0.46 + reliabilityScore + clusterSignal + freshnessBoost + directionBoost + explicitnessBoost + actionableBoost, 0.51, 0.91)
  );
}

function normalizeDirection(value, fallbackValue) {
  return allowedDirections.includes(value) ? value : fallbackValue;
}

function normalizeClaimType(value, fallbackValue) {
  return allowedClaimTypes.includes(value) ? value : fallbackValue;
}

function normalizeExplicitness(value, fallbackValue) {
  return allowedExplicitness.includes(value) ? value : fallbackValue;
}

function normalizeConfidence(value, fallbackValue) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallbackValue;
  }

  return round(clamp(numericValue, 0.51, 0.99));
}

function normalizeThemes(value, fallbackValue) {
  if (!Array.isArray(value)) {
    return fallbackValue;
  }

  const themes = value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 3);

  return themes.length ? themes : fallbackValue;
}

function normalizeMappedAssets(clusterId, source, extractedAssets, bodyLower, rawPost) {
  const config = clusterConfig[clusterId];
  const allowedAssetsForSource = Array.isArray(source.allowedAssets) && source.allowedAssets.length
    ? source.allowedAssets
    : universeTickers;
  const clusterAllowedAssets = config.defaultAssets.filter((ticker) => allowedAssetsForSource.includes(ticker));

  if (Array.isArray(extractedAssets) && extractedAssets.length) {
    const filteredAssets = uniqueSorted(
      extractedAssets
        .map((asset) => String(asset || "").trim())
        .filter((asset) => clusterAllowedAssets.includes(asset))
    );

    if (filteredAssets.length) {
      return filteredAssets.slice(0, 4);
    }
  }

  return deriveMappedAssets(clusterId, bodyLower, source, rawPost);
}

function analyzePost(rawPost, source, generatedAt, extractedClaim = null, extractorMode = "heuristic") {
  const safeSource = getSourceProfile(source);
  const body = String(rawPost.body || "").trim();
  const bodyLower = body.toLowerCase();
  const heuristicClusterId = pickClusterId(rawPost, safeSource, bodyLower);
  const clusterId = clusterPriority.includes(extractedClaim?.topicHint)
    ? extractedClaim.topicHint
    : heuristicClusterId;
  const fallbackDirection = deriveDirection(bodyLower, clusterId);
  const direction = normalizeDirection(extractedClaim?.direction, fallbackDirection);
  const fallbackExplicitness = deriveExplicitness(bodyLower);
  const explicitness = normalizeExplicitness(extractedClaim?.explicitness, fallbackExplicitness);
  const actionable =
    typeof extractedClaim?.actionable === "boolean"
      ? extractedClaim.actionable
      : deriveActionable(bodyLower, clusterId, direction);
  const fallbackConfidence = deriveConfidence({
    clusterId,
    source: safeSource,
    direction,
    explicitness,
    actionable,
    bodyLower,
    createdAt: rawPost.createdAt,
    generatedAt
  });
  const confidence = normalizeConfidence(extractedClaim?.confidence, fallbackConfidence);
  const fallbackClaimType = deriveClaimType(safeSource, bodyLower, clusterId);
  const claimType = normalizeClaimType(extractedClaim?.claimType, fallbackClaimType);
  const themes = normalizeThemes(extractedClaim?.themes, deriveThemes(clusterId, bodyLower, rawPost));
  const mappedAssets = normalizeMappedAssets(clusterId, safeSource, extractedClaim?.mappedAssets, bodyLower, rawPost);

  return {
    id: rawPost.id,
    sourceId: rawPost.sourceId,
    createdAt: rawPost.createdAt,
    timestamp: formatBerlinTimestamp(rawPost.createdAt),
    body,
    actionable,
    claimType,
    direction,
    explicitness,
    themes,
    confidence,
    mappedAssets,
    clusterId,
    agentTrace: {
      clusterId,
      sourceReliability: safeSource.baselineReliability,
      extractedAt: generatedAt,
      extractorMode,
      extractionNote: String(extractedClaim?.extractionNote || "").trim()
    }
  };
}

export function buildHeuristicPostAnalysis({ post, source, generatedAt }) {
  return analyzePost(post, source, generatedAt, null, "heuristic");
}

export function buildNormalizedPostAnalysis({
  post,
  source,
  generatedAt,
  extractedClaim,
  extractorMode = "heuristic"
}) {
  return analyzePost(post, source, generatedAt, extractedClaim, extractorMode);
}

function getDominantDirection(posts, clusterId) {
  const counts = posts.reduce(
    (accumulator, post) => ({
      ...accumulator,
      [post.direction]: (accumulator[post.direction] || 0) + 1
    }),
    {}
  );
  const dominantDirection = Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] || "Mixed";

  if (clusterId === "cluster-policy-noise") {
    return "Neutralized";
  }

  if (clusterId === "cluster-crypto-risk" && dominantDirection === "Bullish") {
    return "Cautiously bullish";
  }

  return dominantDirection;
}

function buildClusterSummary(clusterId, posts, sourceCount) {
  if (clusterId === "cluster-accelerators") {
    return `${sourceCount} monitored sources converged on firmer AI infrastructure demand across ${posts.length} posts, which keeps semis as the cleanest expression in the current window.`;
  }

  if (clusterId === "cluster-enterprise-ai") {
    return `${sourceCount} sources point to better enterprise AI tone, but monetization evidence still looks incomplete and better suited to HOLD than a broad software BUY.`;
  }

  if (clusterId === "cluster-policy-noise") {
    return `${posts.length} posts touched the policy narrative, but the credibility stack stayed too weak for the system to treat it as a tradeable catalyst.`;
  }

  return `${sourceCount} sources kept BTC and risk appetite constructive, but leverage-sensitive language still prevents a clean aggressive read.`;
}

function getNoveltyLabel(agreementScore, postCount) {
  if (agreementScore >= 0.78 && postCount <= 24) {
    return "High";
  }

  if (agreementScore >= 0.6) {
    return "Medium";
  }

  return "Low";
}

function buildRuntimeClusters(posts, generatedAt) {
  return clusterPriority
    .map((clusterId) => {
      const clusterPosts = posts.filter((post) => post.clusterId === clusterId);

      if (!clusterPosts.length) {
        return null;
      }

      const sourceCount = new Set(clusterPosts.map((post) => post.sourceId)).size;
      const actionableShare =
        clusterPosts.filter((post) => post.actionable).length / Math.max(clusterPosts.length, 1);
      const averageConfidence =
        clusterPosts.reduce((sum, post) => sum + post.confidence, 0) / Math.max(clusterPosts.length, 1);
      const directionCounts = clusterPosts.reduce((accumulator, post) => {
        accumulator[post.direction] = (accumulator[post.direction] || 0) + 1;
        return accumulator;
      }, {});
      const dominantCount = Math.max(...Object.values(directionCounts));
      const agreementScore = round(
        clamp(
          averageConfidence * 0.45 +
            (dominantCount / clusterPosts.length) * 0.3 +
            Math.min(0.2, sourceCount * 0.06) +
            actionableShare * 0.12,
          0.41,
          0.92
        )
      );
      const config = clusterConfig[clusterId];

      return {
        id: clusterId,
        title: config.title,
        summary: buildClusterSummary(clusterId, clusterPosts, sourceCount),
        dominantDirection: getDominantDirection(clusterPosts, clusterId),
        novelty: getNoveltyLabel(agreementScore, clusterPosts.length),
        agreementScore,
        timeWindow: formatRelativeWindow(clusterPosts.at(-1)?.createdAt, generatedAt),
        mappedAssets: uniqueSorted(clusterPosts.flatMap((post) => post.mappedAssets)),
        relatedPostIds: clusterPosts.map((post) => post.id),
        sourceAgreement: `${sourceCount} sources across ${clusterPosts.length} posts`,
        policyOutcome:
          clusterId === "cluster-policy-noise"
            ? "Vetoed"
            : clusterId === "cluster-enterprise-ai"
              ? agreementScore >= 0.7
                ? "Eligible"
                : config.policyOutcome
              : clusterId === "cluster-crypto-risk"
                ? agreementScore >= 0.7
                  ? "Eligible"
                  : config.policyOutcome
                : config.policyOutcome,
        marketContext: config.marketContext
      };
    })
    .filter(Boolean);
}

function getAssetScores(asset, clusters, posts) {
  const relatedClusters = clusters.filter((cluster) => cluster.mappedAssets.includes(asset.ticker));
  const mappedPosts = posts.filter((post) => post.mappedAssets.includes(asset.ticker));

  const scoreBook = relatedClusters.reduce(
    (accumulator, cluster) => {
      const mappingWeight = assetWeightByCluster[cluster.id]?.[asset.ticker] || 0.2;
      const positiveWeight =
        cluster.id === "cluster-policy-noise"
          ? 0.08
          : cluster.id === "cluster-enterprise-ai"
            ? 0.72
            : cluster.id === "cluster-crypto-risk"
              ? 0.68
              : 1;
      const cautionWeight =
        cluster.id === "cluster-enterprise-ai"
          ? 0.26
          : cluster.id === "cluster-crypto-risk"
            ? 0.34
            : cluster.id === "cluster-policy-noise"
              ? 0.22
              : 0.12;
      const negativeWeight =
        cluster.id === "cluster-policy-noise"
          ? 0.72
          : cluster.id === "cluster-crypto-risk"
            ? 0.18
            : cluster.id === "cluster-enterprise-ai"
              ? 0.08
              : 0.04;

      accumulator.support += cluster.agreementScore * mappingWeight * positiveWeight;
      accumulator.caution += cluster.agreementScore * mappingWeight * cautionWeight;
      accumulator.risk += cluster.agreementScore * mappingWeight * negativeWeight;
      return accumulator;
    },
    {
      support: 0,
      caution: 0,
      risk: 0
    }
  );

  return {
    ...scoreBook,
    relatedClusters,
    mappedPosts,
    sourceCoverage: new Set(mappedPosts.map((post) => post.sourceId)).size
  };
}

function getPrimaryClusterForAsset(asset, relatedClusters) {
  return [...relatedClusters].sort((left, right) => {
    const leftWeight = assetWeightByCluster[left.id]?.[asset.ticker] || 0;
    const rightWeight = assetWeightByCluster[right.id]?.[asset.ticker] || 0;
    return right.agreementScore * rightWeight - left.agreementScore * leftWeight;
  })[0];
}

function computeCandidateAction(asset, scores) {
  if (asset.ticker === "AMD" && scores.risk >= 0.48 && scores.support < 0.4) {
    return "SELL";
  }

  if (asset.ticker === "QQQ" && scores.support >= 0.55 && scores.risk < 0.35) {
    return "BUY";
  }

  if (asset.ticker === "BTC" && scores.support >= 0.54 && scores.risk < 0.28) {
    return "BUY";
  }

  if (scores.support >= 0.68 && scores.risk < 0.42) {
    return "BUY";
  }

  if (scores.risk >= 0.52 && scores.support < 0.45) {
    return "SELL";
  }

  return "HOLD";
}

function applyPolicyOverrides(asset, scores, candidateAction, primaryCluster) {
  let finalAction = candidateAction;
  let vetoReason = "";

  if (asset.ticker === "QQQ" && candidateAction === "BUY") {
    finalAction = "HOLD";
    vetoReason = "Broad ETF exposure stays secondary while the engine still sees cleaner single-name or sector expressions.";
  }

  if (asset.ticker === "BTC" && candidateAction === "BUY" && scores.caution >= 0.18) {
    finalAction = "HOLD";
    vetoReason = "Crypto support is real, but crowded positioning keeps BTC below the BUY threshold for now.";
  }

  if (asset.ticker === "MSFT" && candidateAction === "BUY" && scores.sourceCoverage < 2) {
    finalAction = "HOLD";
    vetoReason = "Enterprise AI chatter is improving, but one-source evidence is still too thin for a software BUY.";
  }

  if (asset.ticker === "META" && candidateAction === "BUY" && scores.mappedPosts.length < 3) {
    finalAction = "HOLD";
    vetoReason = "The current enterprise narrative is still too indirect to authorize a Meta-specific BUY.";
  }

  if (asset.ticker === "AMD" && finalAction !== "SELL" && primaryCluster?.id === "cluster-policy-noise" && scores.risk >= 0.44) {
    finalAction = "SELL";
    vetoReason = "The only direct AMD catalyst in the active window was downgraded by the policy-noise filter.";
  }

  return {
    finalAction,
    vetoReason
  };
}

function applyMarketAdjustments(asset, scores, marketData) {
  if (!marketData) {
    return scores;
  }

  let support = scores.support;
  let risk = scores.risk;
  let caution = scores.caution;

  if (marketData.returns5d > 0.045) {
    support += 0.07;
  } else if (marketData.returns5d < -0.015) {
    risk += 0.06;
  }

  if (marketData.relativeStrength > 0.02) {
    support += 0.05;
  } else if (marketData.relativeStrength < -0.015) {
    risk += 0.05;
  }

  if (marketData.volumeRatio > 1.2) {
    support += 0.03;
  } else if (marketData.volumeRatio < 0.95) {
    caution += 0.04;
  }

  if (asset.ticker === "BTC" && marketData.volatilityScore > 0.68) {
    caution += 0.08;
    risk += 0.03;
  }

  if (asset.ticker === "QQQ" && marketData.relativeStrength < 0.005) {
    caution += 0.05;
  }

  return {
    ...scores,
    support,
    risk,
    caution
  };
}

function deriveDecisionMath(asset, primaryCluster, finalAction, scores, marketData, vetoReason) {
  const clusterAgreement = primaryCluster?.agreementScore ?? 0.5;
  const support = scores.support;
  const risk = scores.risk;
  const caution = scores.caution;
  const sourceCoverage = scores.sourceCoverage;
  const mappedPostCount = scores.mappedPosts.length;
  const assetBias =
    asset.ticker === "BTC"
      ? -0.04
      : asset.ticker === "QQQ"
        ? -0.02
        : asset.ticker === "SOXX" || asset.ticker === "NVDA"
          ? 0.01
          : 0;
  const returns5d = Number(marketData?.returns5d || 0);
  const relativeStrength = Number(marketData?.relativeStrength || 0);
  const volumeRatio = Number(marketData?.volumeRatio || 1);
  const volatility = Number(marketData?.volatilityScore || 0);
  const trendLift = clamp(returns5d * 0.7 + relativeStrength * 6 + (volumeRatio - 1) * 0.02, -0.04, 0.05);
  const downsidePressure = clamp(
    Math.max(0, -returns5d) * 0.8 + Math.max(0, -relativeStrength) * 5 + Math.max(0, volatility - 0.5) * 0.03,
    0,
    0.05
  );
  const thesisProbability = round(
    clamp(
      0.38 +
        (clusterAgreement - 0.5) * 0.55 +
        (support - risk) * 0.22 +
        sourceCoverage * 0.015 +
        Math.min(mappedPostCount, 4) * 0.01 +
        trendLift -
        caution * 0.17 -
        (vetoReason ? 0.06 : 0) +
        assetBias +
        (finalAction === "BUY" ? 0.04 : finalAction === "SELL" ? 0.01 : -0.05),
      0.28,
      0.86
    )
  );

  const expectedUpside = round(
    clamp(
      finalAction === "SELL"
        ? 0.02 + risk * 0.05 + caution * 0.03 + downsidePressure + (vetoReason ? 0.008 : 0)
        : 0.025 + support * 0.06 + clusterAgreement * 0.05 + Math.max(0, trendLift) * 0.4,
      0.02,
      0.16
    )
  );
  const expectedDownside = round(
    clamp(
      finalAction === "SELL"
        ? 0.02 + support * 0.04 + caution * 0.03 + Math.max(0, trendLift) * 0.2 + volatility * 0.03
        : 0.02 + risk * 0.05 + caution * 0.04 + volatility * 0.03 + downsidePressure + (vetoReason ? 0.01 : 0),
      0.02,
      0.12
    )
  );
  const rewardRisk = round(clamp(expectedUpside / Math.max(expectedDownside, 0.01), 0.4, 4));
  const maxLossGuardrail = round(clamp(expectedDownside * 0.7, 0.02, 0.06));
  const uncertainty = round(
    clamp(
      0.16 +
        caution * 0.24 +
        Math.max(0, 0.58 - clusterAgreement) * 0.18 +
        Math.max(0, 3 - sourceCoverage) * 0.03 +
        Math.max(0, volatility - 0.42) * 0.08 +
        (vetoReason ? 0.04 : 0),
      0.1,
      0.42
    )
  );
  const sizeBand =
    finalAction === "SELL"
      ? thesisProbability >= 0.7 && expectedDownside >= expectedUpside
        ? "exit"
        : "reduce"
      : finalAction === "HOLD"
        ? "watch"
        : thesisProbability >= 0.76 && rewardRisk >= 2 && maxLossGuardrail <= 0.035
          ? "small"
          : thesisProbability >= 0.68 && rewardRisk >= 1.6
            ? "starter"
            : "probe";

  return {
    thesisProbability,
    uncertainty,
    expectedUpside,
    expectedDownside,
    rewardRisk,
    sizeBand,
    maxLossGuardrail,
    decisionMathSummary: `${Math.round(thesisProbability * 100)}% thesis probability, ${rewardRisk.toFixed(
      1
    )}x reward/risk, ${sizeBand} size band, ${Math.round(maxLossGuardrail * 100)}% max-loss guardrail.`
  };
}

function buildMarketContext(asset, primaryCluster, scores, marketData) {
  if (!marketData) {
    return {
      regime:
        primaryCluster?.id === "cluster-accelerators"
          ? "Risk-on, semi-led"
          : primaryCluster?.id === "cluster-enterprise-ai"
            ? "Constructive, proof-sensitive"
            : primaryCluster?.id === "cluster-crypto-risk"
              ? "Risk-on, leverage-sensitive"
              : "Narrative-heavy, credibility-sensitive",
      signalStrength: `${Math.round((primaryCluster?.agreementScore || 0.5) * 100)}% agreement`,
      sourceCoverage: `${scores.sourceCoverage} sources / ${scores.mappedPosts.length} mapped posts`,
      policyState: primaryCluster?.policyOutcome || "Waiting",
      assetExpression:
        asset.ticker === "QQQ"
          ? "Broad fallback expression"
          : asset.ticker === "SOXX"
            ? "Diversified sector expression"
            : asset.ticker === "BTC"
              ? "Highest-evidence threshold"
              : "Direct thematic expression"
    };
  }

  return {
    regime: marketData.regime,
    signalStrength: `${Math.round((primaryCluster?.agreementScore || 0.5) * 100)}% agreement`,
    sourceCoverage: `${scores.sourceCoverage} sources / ${scores.mappedPosts.length} mapped posts`,
    policyState: primaryCluster?.policyOutcome || "Waiting",
    lastPrice: marketData.display.lastPrice,
    returns5d: marketData.display.returns5d,
    relativeStrength: marketData.display.relativeStrength,
    volumeRatio: marketData.display.volumeRatio,
    volatility: marketData.display.volatility,
    assetExpression:
      asset.ticker === "QQQ"
        ? "Broad fallback expression"
        : asset.ticker === "SOXX"
          ? "Diversified sector expression"
          : asset.ticker === "BTC"
            ? "Highest-evidence threshold"
            : "Direct thematic expression"
  };
}

function buildDecisionRationale(asset, primaryCluster, finalAction, vetoReason, scores) {
  if (!primaryCluster) {
    return {
      rationale: [
        `No active cluster currently maps cleanly into ${asset.ticker}.`,
        "The engine defaults to HOLD when the signal stack is missing rather than hallucinating a thesis.",
        "This keeps the universe narrow and explainable while ingestion is still local."
      ],
      whyNot: [
        "Not BUY because there is no live narrative with enough mapped evidence.",
        "Not SELL because the absence of signal is not the same as adverse signal."
      ],
      uncertainty: [
        "A single new source or a fresher cluster can change this quickly once the feed updates."
      ]
    };
  }

  if (finalAction === "BUY") {
    return {
      rationale: [
        `${primaryCluster.title} has ${primaryCluster.sourceAgreement.toLowerCase()} and remains ${primaryCluster.policyOutcome.toLowerCase()}.`,
        `${asset.ticker} is a direct expression of that narrative with ${scores.mappedPosts.length} mapped posts in the active window.`,
        "The policy layer did not find a freshness or credibility issue strong enough to block the bullish setup."
      ],
      whyNot: [
        "Not HOLD because the narrative is still fresh, aligned, and above the BUY support threshold.",
        "Not SELL because there is no adverse cluster with enough credibility to outweigh the current evidence."
      ],
      uncertainty: [
        asset.riskFlag,
        "This call would weaken quickly if the supporting narrative stops broadening or gets contradicted by fresher posts."
      ]
    };
  }

  if (finalAction === "SELL") {
    return {
      rationale: [
        `${primaryCluster.title} is the only direct narrative touching ${asset.ticker}, and the policy layer is treating it as ${primaryCluster.policyOutcome.toLowerCase()}.`,
        `${scores.mappedPosts.length} mapped posts were not enough to preserve upside conviction once credibility fell away.`,
        "In this engine, invalidated catalysts become reduce-or-exit signals rather than passive HOLDs."
      ],
      whyNot: [
        "Not HOLD because the active catalyst stack degraded instead of merely staying incomplete.",
        "Not BUY because the current evidence is either noisy, contradicted, or too weak to trust."
      ],
      uncertainty: [
        asset.riskFlag,
        "This is usually the lowest-confidence action class because it depends on the absence or invalidation of support."
      ]
    };
  }

  return {
    rationale: [
      `${primaryCluster.title} is relevant to ${asset.ticker}, but the current evidence still sits below the engine's clear-action bar.`,
      `${scores.mappedPosts.length} mapped posts across ${scores.sourceCoverage} sources are enough to keep the name on watch, not enough to force a directional upgrade.`,
      vetoReason || "The deterministic policy layer is deliberately choosing patience over forced conviction."
    ],
    whyNot: [
      "Not BUY because the signal is still partial, indirect, or blocked by a conservative policy rule.",
      "Not SELL because the evidence is incomplete rather than clearly negative."
    ],
    uncertainty: [
      asset.riskFlag,
      "A second high-quality source or cleaner market confirmation could shift this out of HOLD quickly."
    ]
  };
}

function buildDecisionBook(clusters, posts, marketSnapshot) {
  const decisions = [];
  const vetoedSignals = [];
  const marketByTicker = marketSnapshot?.byTicker || {};

  for (const asset of monitoredUniverse) {
    const rawScores = getAssetScores(asset, clusters, posts);
    const marketData = marketByTicker[asset.ticker];
    const scores = applyMarketAdjustments(asset, rawScores, marketData);
    const primaryCluster = getPrimaryClusterForAsset(asset, scores.relatedClusters);
    const candidateAction = computeCandidateAction(asset, scores);
    const policyResult = applyPolicyOverrides(asset, scores, candidateAction, primaryCluster);
    const finalAction = policyResult.finalAction;
    const decisionCopy = buildDecisionRationale(
      asset,
      primaryCluster,
      finalAction,
      policyResult.vetoReason,
      scores
    );
    const decisionMath = deriveDecisionMath(
      asset,
      primaryCluster,
      finalAction,
      scores,
      marketData,
      policyResult.vetoReason
    );
    const confidence = round(
      clamp(
        0.5 +
          Math.max(scores.support, scores.risk) * 0.22 +
          scores.sourceCoverage * 0.02 +
          Math.min(0.05, scores.mappedPosts.length * 0.008) -
          scores.caution * 0.08 -
          (marketData?.relativeStrength > 0.02 ? 0.02 : 0) +
          (marketData?.returns5d < -0.015 ? -0.03 : 0) -
          (policyResult.vetoReason ? 0.04 : 0),
        0.51,
        0.89
      )
    );

    decisions.push({
      id: `dec-${asset.ticker.toLowerCase()}`,
      asset: asset.ticker,
      action: finalAction,
      confidence,
      horizon:
        primaryCluster?.id === "cluster-enterprise-ai"
          ? "4-8 days"
          : primaryCluster?.id === "cluster-crypto-risk"
            ? "2-5 days"
            : "3-7 days",
      timestamp: formatBerlinTimestamp(posts[0]?.createdAt || new Date().toISOString()),
      clusterIds: primaryCluster ? [primaryCluster.id] : [],
      decisionMath,
      thesisProbability: decisionMath.thesisProbability,
      uncertaintyScore: decisionMath.uncertainty,
      expectedUpside: decisionMath.expectedUpside,
      expectedDownside: decisionMath.expectedDownside,
      rewardRisk: decisionMath.rewardRisk,
      sizeBand: decisionMath.sizeBand,
      maxLossGuardrail: decisionMath.maxLossGuardrail,
      decisionMathSummary: decisionMath.decisionMathSummary,
      rationale: decisionCopy.rationale,
      whyNot: decisionCopy.whyNot,
      uncertainty: decisionCopy.uncertainty,
      vetoed: Boolean(policyResult.vetoReason),
      vetoReason: policyResult.vetoReason,
      marketContext: buildMarketContext(asset, primaryCluster, scores, marketData)
    });

    if (policyResult.vetoReason) {
      vetoedSignals.push({
        id: `veto-${asset.ticker.toLowerCase()}`,
        asset: asset.ticker,
        candidateAction,
        finalAction,
        reason: policyResult.vetoReason,
        clusterId: primaryCluster?.id || "",
        status: "Vetoed by policy engine"
      });
    }
  }

  return {
    decisions,
    vetoedSignals
  };
}

export async function runAgenticEngine({
  posts,
  sources,
  generatedAt = new Date().toISOString(),
  marketSnapshot = null
}) {
  const sourceMap = new Map(sources.map((source) => [source.id, getSourceProfile(source)]));
  const extractionResult = await extractClaimsForPosts({
    posts,
    sources,
    generatedAt
  });
  const analysedPosts = sortByDateDescending(
    posts.map((post) =>
      analyzePost(
        post,
        sourceMap.get(post.sourceId),
        generatedAt,
        extractionResult.extractions.get(post.id),
        extractionResult.stats.activeMode
      )
    )
  );
  const runtimeClusters = buildRuntimeClusters(analysedPosts, generatedAt);
  const decisionBook = buildDecisionBook(runtimeClusters, analysedPosts, marketSnapshot);
  const actionableCount = analysedPosts.filter((post) => post.actionable).length;
  const engineMode =
    extractionResult.stats.activeMode === "openai"
      ? "model-backed-agent-v2"
      : "hybrid-agent-v2-heuristic";

  return {
    mode: engineMode,
    generatedAt,
    posts: analysedPosts,
    clusters: runtimeClusters,
    decisions: decisionBook.decisions,
    vetoedSignals: decisionBook.vetoedSignals,
    extractor: extractionResult.stats,
    market: marketSnapshot,
    summary: {
      claimCount: analysedPosts.length,
      actionableCount,
      clusterCount: runtimeClusters.length,
      decisionCount: decisionBook.decisions.length,
      vetoCount: decisionBook.vetoedSignals.length,
      sourceCount: sources.length,
      extractorMode: extractionResult.stats.activeMode,
      extractorModel: extractionResult.stats.model,
      extractorCacheHits: extractionResult.stats.cacheHits,
      extractorLiveExtractions: extractionResult.stats.liveExtractions,
      extractorFallbackCount: extractionResult.stats.fallbackCount,
      marketRegime: marketSnapshot?.summary?.marketRegime || "",
      newestPostAt: analysedPosts[0]?.createdAt || "",
      oldestPostAt: analysedPosts.at(-1)?.createdAt || ""
    },
    stages: [
      {
        id: "ingestion",
        name: "Ingestion agent",
        metric: `${analysedPosts.length} fetched posts`,
        description: "Loads the append-only local tweet feed and source registry into the runtime snapshot."
      },
      {
        id: "claim-extraction",
        name: "Claim extraction agent",
        metric: `${actionableCount} actionable claims`,
        description:
          extractionResult.stats.activeMode === "openai"
            ? "Uses an OpenAI structured-output extractor with a persistent cache, then normalizes the output into the deterministic engine."
            : "Falls back to the built-in heuristic extractor until an OpenAI API key is configured."
      },
      {
        id: "clustering",
        name: "Clustering agent",
        metric: `${runtimeClusters.length} live narratives`,
        description:
          "Groups aligned claims into runtime clusters using theme matching, source weighting, and freshness."
      },
      {
        id: "policy",
        name: "Policy agent",
        metric: `${decisionBook.decisions.length} support calls`,
        description:
          "Applies deterministic veto rules so broad, noisy, or leverage-crowded signals get downgraded before the decision book."
      },
      {
        id: "market",
        name: "Market context agent",
        metric: marketSnapshot?.summary?.marketRegime || "mock market pending",
        description:
          "Adds deterministic market inputs like returns, relative strength, volume ratio, and volatility before final confidence is set."
      }
    ],
    notes: [
      "Tweets stay fetched and append-only in this phase.",
      "There is no operator tweet, cluster, or decision review surface in the product model right now.",
      extractionResult.stats.activeMode === "openai"
        ? `Model extraction is running on ${extractionResult.stats.model} with ${extractionResult.stats.cacheHits} cache hits in this snapshot.`
        : "Set OPENAI_API_KEY to turn on model-backed claim extraction; the deterministic fallback remains active otherwise.",
      ...extractionResult.warnings.slice(0, 2)
    ]
  };
}
