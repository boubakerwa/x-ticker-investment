import { monitoredUniverse } from "./data.js";
import {
  buildImpactMappingFingerprint,
  readImpactMappingCache,
  upsertImpactMappingCache
} from "./impactMappingCacheStore.js";
import { requestStructuredResponse, resolveLlmConfig } from "./llmClient.js";

const DEFAULT_IMPACT_MODEL = "gpt-4.1-mini";
const DEFAULT_PROMPT_VERSION = "impact-mapper-v1";
const IMPACT_MAPPING_BATCH_SIZE = 6;
const allowedDirectness = ["Direct", "Read-through", "Second-order", "Portfolio fit"];
const allowedImpactDirections = ["Positive", "Negative", "Mixed"];

const promptExamples = [
  {
    id: "impact-example-ai-procurement",
    label: "Government AI procurement broadens the infra beneficiaries",
    post:
      "Federal agencies are moving faster on AI infrastructure procurement than expected, and the wording now sounds operational rather than hypothetical.",
    strictContext: {
      topicHint: "cluster-accelerators",
      claimType: "Policy interpretation",
      direction: "Bullish",
      actionable: true,
      mappedAssets: ["NVDA", "SOXX"]
    },
    expected: [
      {
        asset: "NVDA",
        impactDirection: "Positive",
        directness: "Read-through",
        reason: "AI infrastructure procurement directly benefits the leading compute supplier."
      },
      {
        asset: "AMD",
        impactDirection: "Positive",
        directness: "Second-order",
        reason: "Broader government AI demand can spill into the challenger stack as the beneficiary set widens."
      },
      {
        asset: "TSM",
        impactDirection: "Positive",
        directness: "Read-through",
        reason: "More AI hardware procurement increases foundry and packaging demand."
      }
    ]
  },
  {
    id: "impact-example-scandal-rumor",
    label: "Single-name shock can still affect adjacent expressions",
    post: "A breaking rumor says NVIDIA data centers face a full shutdown after a CEO scandal, and the tape is reacting fast.",
    strictContext: {
      topicHint: "cluster-policy-noise",
      claimType: "Debunk / clarification",
      direction: "Neutral",
      actionable: false,
      mappedAssets: ["NVDA"]
    },
    expected: [
      {
        asset: "NVDA",
        impactDirection: "Negative",
        directness: "Direct",
        reason: "The rumor is explicitly about NVIDIA, so it is the primary impacted name even if the post is later filtered down."
      },
      {
        asset: "SOXX",
        impactDirection: "Negative",
        directness: "Read-through",
        reason: "A large AI-compute scare can pressure the broader semiconductor expression."
      }
    ]
  },
  {
    id: "impact-example-personal-watchlist",
    label: "Tracked-universe names can be inferred even without ticker language",
    post: "Washington is leaning into AI services procurement, which should favor vendors with existing federal relationships and enterprise deployment capacity.",
    strictContext: {
      topicHint: "cluster-enterprise-ai",
      claimType: "Policy interpretation",
      direction: "Bullish",
      actionable: true,
      mappedAssets: ["QQQ"]
    },
    expected: [
      {
        asset: "IBM",
        impactDirection: "Positive",
        directness: "Second-order",
        reason: "Federal-services exposure plus enterprise AI implementation makes IBM a plausible tracked-universe beneficiary."
      }
    ]
  }
];

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function normalizeTickerList(values) {
  return [...new Set((values || []).map((value) => normalizeTicker(value)).filter(Boolean))];
}

function getAccountBucketLookup(financialProfile = {}) {
  return new Map(
    (Array.isArray(financialProfile.accountBuckets) ? financialProfile.accountBuckets : [])
      .map((bucket) => [String(bucket?.id || "").trim(), bucket])
      .filter(([bucketId]) => bucketId)
  );
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

function buildWatchedUniverseAsset(ticker, baseAsset, holding, isWatchlist, bucketLookup = new Map()) {
  const normalizedTicker = normalizeTicker(ticker);

  if (!normalizedTicker) {
    return null;
  }

  const isHolding = Boolean(holding);
  const trackingLabel = buildTrackedSourceLabel({ isHolding, isWatchlist });
  const personalNotes = String(holding?.notes || "").trim();
  const personalCategory = String(holding?.category || "").trim();
  const personalLabel = String(holding?.label || "").trim();
  const personalBucket = String(bucketLookup.get(String(holding?.accountBucketId || "").trim())?.label || "").trim();

  return {
    ...(baseAsset || {}),
    ticker: normalizedTicker,
    name: baseAsset?.name || personalLabel || normalizedTicker,
    type: baseAsset?.type || personalCategory || "Custom tracked asset",
    bucket: baseAsset?.bucket || personalBucket || trackingLabel || "Tracked asset",
    thesis: baseAsset?.thesis || personalNotes || "",
    riskFlag: baseAsset?.riskFlag || "",
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

export function buildImpactCandidateUniverse(financialProfile = {}) {
  const trackedTickers = normalizeTickerList([
    ...(financialProfile.holdings || []).map((holding) => holding.ticker),
    ...(financialProfile.watchlist || [])
  ]);
  const accountBucketLookup = getAccountBucketLookup(financialProfile);
  const holdingsByTicker = new Map(
    (financialProfile.holdings || [])
      .map((holding) => [normalizeTicker(holding.ticker), holding])
      .filter(([ticker]) => ticker)
  );
  const watchlistSet = new Set(normalizeTickerList(financialProfile.watchlist || []));
  const baseByTicker = new Map(
    monitoredUniverse
      .map((asset) => [normalizeTicker(asset.ticker), asset])
      .filter(([ticker]) => ticker)
  );
  const candidateUniverse = [];
  const seen = new Set();

  trackedTickers.forEach((ticker) => {
    const watchedAsset = buildWatchedUniverseAsset(
      ticker,
      baseByTicker.get(ticker) || null,
      holdingsByTicker.get(ticker) || null,
      watchlistSet.has(ticker),
      accountBucketLookup
    );

    if (watchedAsset && !seen.has(ticker)) {
      candidateUniverse.push(watchedAsset);
      seen.add(ticker);
    }
  });

  monitoredUniverse.forEach((asset) => {
    const ticker = normalizeTicker(asset.ticker);

    if (!ticker || seen.has(ticker)) {
      return;
    }

    const watchedAsset = buildWatchedUniverseAsset(
      ticker,
      asset,
      holdingsByTicker.get(ticker) || null,
      watchlistSet.has(ticker),
      accountBucketLookup
    );

    if (watchedAsset) {
      candidateUniverse.push(watchedAsset);
      seen.add(ticker);
    }
  });

  return candidateUniverse;
}

function buildImpactMappingSchema(candidateTickers) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["postId", "likelyImpacts"],
          properties: {
            postId: {
              type: "string"
            },
            likelyImpacts: {
              type: "array",
              maxItems: 5,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["asset", "score", "directness", "impactDirection", "reason"],
                properties: {
                  asset: {
                    type: "string",
                    enum: candidateTickers
                  },
                  score: {
                    type: "number",
                    minimum: 0,
                    maximum: 1
                  },
                  directness: {
                    type: "string",
                    enum: allowedDirectness
                  },
                  impactDirection: {
                    type: "string",
                    enum: allowedImpactDirections
                  },
                  reason: {
                    type: "string"
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

function normalizeMode(value) {
  return value === "openai" ? value : "auto";
}

export function getImpactMapperConfig() {
  const requestedMode = normalizeMode((process.env.IMPACT_MAPPER_MODE || "auto").toLowerCase());
  const llmConfig = resolveLlmConfig({
    modelEnvVar: "IMPACT_MAPPER_MODEL",
    defaultModel: process.env.OPENAI_MODEL || DEFAULT_IMPACT_MODEL
  });
  const activeMode =
    requestedMode === "openai" && (llmConfig.provider === "local_openai_compatible" || llmConfig.apiKey)
      ? "openai"
      : requestedMode === "auto" && (llmConfig.provider === "local_openai_compatible" || llmConfig.apiKey)
        ? "openai"
        : "disabled";

  return {
    requestedMode,
    activeMode,
    provider: llmConfig.provider,
    apiKey: llmConfig.apiKey,
    baseUrl: llmConfig.baseUrl,
    model: llmConfig.model,
    promptVersion: DEFAULT_PROMPT_VERSION
  };
}

function getSafeConfig(config) {
  return {
    requestedMode: config.requestedMode,
    activeMode: config.activeMode,
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    promptVersion: config.promptVersion
  };
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function buildCandidateAssetSummary(asset) {
  return {
    ticker: asset.ticker,
    name: asset.name || asset.ticker,
    type: asset.type || "",
    bucket: asset.bucket || "",
    thesis: asset.thesis || "",
    riskFlag: asset.riskFlag || "",
    isTracked: Boolean(asset.isTracked),
    isHolding: Boolean(asset.isHolding),
    isWatchlist: Boolean(asset.isWatchlist),
    trackingLabel: asset.trackingLabel || "",
    personalCategory: asset.personalCategory || "",
    personalNotes: asset.personalNotes || ""
  };
}

function buildBatchPayload(posts, sourceMap, candidateUniverse) {
  return posts.map((post) => {
    const source = sourceMap.get(post.sourceId) || {};

    return {
      postId: post.id,
      body: post.body,
      createdAt: post.createdAt,
      source: {
        id: source.id || post.sourceId,
        handle: source.handle || "",
        category: source.category || "Operator / Custom",
        baselineReliability: source.baselineReliability ?? 0.6,
        reliabilityLabel: source.reliability?.label || "",
        relevantSectors: source.relevantSectors || [],
        allowedAssets: source.allowedAssets || []
      },
      normalizedClaim: {
        topicHint: post.clusterId || "",
        claimType: post.claimType || "",
        direction: post.direction || "",
        actionable: Boolean(post.actionable),
        confidence: Number(post.confidence || 0),
        strictMappedAssets: Array.isArray(post.mappedAssets) ? post.mappedAssets : [],
        assetMapping: post.assetMapping || {}
      },
      candidateUniverse: candidateUniverse.map((asset) => buildCandidateAssetSummary(asset))
    };
  });
}

function buildPromptGuide() {
  return {
    label: "Tracked-universe impact mapper",
    goal:
      "Rank the most likely impacted assets from the candidate universe for each post, even when the asset is only implied rather than named directly.",
    instructions: [
      "Use the normalized claim context plus the candidate-universe metadata to infer which assets are most affected by the post.",
      "Do not limit yourself to explicit ticker mentions. Read-through and second-order effects are allowed when the economic linkage is real.",
      "Keep the list narrow. Prefer zero to three strong impacts over a broad speculative list.",
      "Strict mapped assets are high-precision constraints, not the full answer. If a watched-universe asset is clearly impacted even without ticker language, include it with a lower directness label if needed.",
      "Direct means the post explicitly names the asset or its company. Read-through means the asset is a close thematic expression. Second-order means a plausible but indirect beneficiary or casualty. Portfolio fit is reserved for tracked names supported mainly by the user's saved notes or category.",
      "impactDirection should describe the likely effect on the asset: Positive, Negative, or Mixed.",
      "Reasons should be short, specific, and causal.",
      "Prefer false negatives over fantasy. If the linkage is weak, leave the asset out."
    ],
    examples: promptExamples
  };
}

function buildInstructions() {
  const promptGuide = buildPromptGuide();

  return [
    "You are an investment-impact mapper for a narrow operator workflow.",
    promptGuide.goal,
    ...promptGuide.instructions
  ].join(" ");
}

function buildUserPrompt(posts, sourceMap, generatedAt, candidateUniverse) {
  return JSON.stringify(
    {
      generatedAt,
      promptVersion: DEFAULT_PROMPT_VERSION,
      candidateUniversePolicy:
        "The candidate universe merges the curated monitored assets with the user's tracked holdings and watchlist. Use the stored thesis, bucket, and notes to infer impact when the linkage is real.",
      directnessLabels: allowedDirectness,
      impactDirections: allowedImpactDirections,
      calibrationExamples: promptExamples,
      posts: buildBatchPayload(posts, sourceMap, candidateUniverse)
    },
    null,
    2
  );
}

function getImpactMapperRetryConfig() {
  const maxRetries = Math.max(0, Number(process.env.IMPACT_MAPPER_MAX_RETRIES || 2));
  const baseDelayMs = Math.max(150, Number(process.env.IMPACT_MAPPER_RETRY_BASE_MS || 800));

  return {
    maxRetries,
    baseDelayMs
  };
}

function shouldRetryImpactError(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("temporarily") ||
    message.includes("overloaded") ||
    message.includes("timeout") ||
    message.includes("fetch failed")
  );
}

export function buildImpactMappingRequest({
  posts,
  sources,
  generatedAt,
  financialProfile = {},
  config = getImpactMapperConfig()
}) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const candidateUniverse = buildImpactCandidateUniverse(financialProfile);
  const schema = buildImpactMappingSchema(candidateUniverse.map((asset) => asset.ticker));
  const instructions = buildInstructions();
  const inputText = buildUserPrompt(posts, sourceMap, generatedAt, candidateUniverse);

  return {
    promptVersion: config.promptVersion,
    promptGuide: buildPromptGuide(),
    config: getSafeConfig(config),
    candidateUniverse,
    schema,
    inputText,
    requestBody: {
      model: config.model,
      store: false,
      instructions,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: inputText
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "post_impact_rankings",
          strict: true,
          schema
        }
      }
    }
  };
}

function normalizeImpactItem(item, candidateSet) {
  const ticker = normalizeTicker(item?.asset);

  if (!ticker || !candidateSet.has(ticker)) {
    return null;
  }

  const score = Number(item?.score);

  return {
    asset: ticker,
    score: Number(Math.max(0, Math.min(Number.isFinite(score) ? score : 0, 1)).toFixed(2)),
    directness: allowedDirectness.includes(item?.directness) ? item.directness : "Read-through",
    impactDirection: allowedImpactDirections.includes(item?.impactDirection) ? item.impactDirection : "Mixed",
    reason: String(item?.reason || "").trim()
  };
}

function normalizeImpactItems(items, candidateSet) {
  const impactMap = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const normalizedItem = normalizeImpactItem(item, candidateSet);

    if (!normalizedItem) {
      continue;
    }

    const existing = impactMap.get(normalizedItem.asset);

    if (!existing || normalizedItem.score > existing.score) {
      impactMap.set(normalizedItem.asset, normalizedItem);
    }
  }

  return [...impactMap.values()]
    .sort((left, right) => right.score - left.score || left.asset.localeCompare(right.asset))
    .slice(0, 5);
}

async function requestOpenAIImpactMappings(posts, sourceMap, generatedAt, financialProfile, config) {
  const requestEnvelope = buildImpactMappingRequest({
    posts,
    sources: [...sourceMap.values()],
    generatedAt,
    financialProfile,
    config
  });
  const response = await requestStructuredResponse({
    config,
    instructions: requestEnvelope.requestBody.instructions,
    inputText: requestEnvelope.inputText,
    schema: requestEnvelope.schema,
    schemaName: "post_impact_rankings",
    emptyOutputMessage: "No structured impact-mapping payload was returned by the model.",
    requestErrorMessage: "Impact-mapping request failed.",
    maxRetries: getImpactMapperRetryConfig().maxRetries,
    baseDelayMs: getImpactMapperRetryConfig().baseDelayMs,
    shouldRetry: shouldRetryImpactError
  });
  const parsed = JSON.parse(response.outputText);

  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    rawText: response.outputText,
    rawResponse: response.payload,
    requestEnvelope
  };
}

export async function rankLikelyImpactsForPosts({
  posts,
  sources,
  generatedAt,
  financialProfile = {},
  useCache = true
}) {
  const config = getImpactMapperConfig();
  const impacts = new Map();
  const warnings = [];
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const candidateUniverse = buildImpactCandidateUniverse(financialProfile);
  const candidateSet = new Set(candidateUniverse.map((asset) => asset.ticker));
  const cacheStore = useCache ? readImpactMappingCache() : { entries: {} };
  const nextCacheEntries = {};
  let liveMappings = 0;
  let failureCount = 0;
  let cacheHits = 0;
  let cacheWrites = 0;

  if (config.activeMode !== "openai" || !posts.length || !candidateUniverse.length) {
    return {
      impacts,
      stats: {
        requestedMode: config.requestedMode,
        activeMode: config.activeMode,
        provider: config.provider,
        model: config.model,
        promptVersion: config.promptVersion,
        candidateCount: candidateUniverse.length,
        cacheHits,
        cacheWrites,
        liveMappings,
        failureCount
      },
      promptGuide: buildPromptGuide(),
      warnings
    };
  }

  const pendingPosts = [];

  for (const post of posts) {
    const source = sourceMap.get(post.sourceId) || {};
    const fingerprint = buildImpactMappingFingerprint({
      promptVersion: config.promptVersion,
      model: config.model,
      post,
      source,
      candidateUniverse
    });
    const cachedEntry = cacheStore.entries[fingerprint];

    if (cachedEntry?.impacts) {
      impacts.set(post.id, normalizeImpactItems(cachedEntry.impacts, candidateSet));
      cacheHits += 1;
      continue;
    }

    pendingPosts.push({
      ...post,
      _fingerprint: fingerprint
    });
  }

  for (const postBatch of chunk(pendingPosts, IMPACT_MAPPING_BATCH_SIZE)) {
    try {
      const batchResponse = await requestOpenAIImpactMappings(
        postBatch,
        sourceMap,
        generatedAt,
        financialProfile,
        config
      );
      const impactByPostId = new Map(batchResponse.items.map((item) => [item.postId, item]));

      for (const post of postBatch) {
        const impactItem = impactByPostId.get(post.id);

        if (!impactItem) {
          impacts.set(post.id, []);
          continue;
        }

        const normalizedImpacts = normalizeImpactItems(impactItem.likelyImpacts, candidateSet);
        impacts.set(post.id, normalizedImpacts);
        nextCacheEntries[post._fingerprint] = {
          provider: config.provider === "local_openai_compatible" ? "local-openai-compatible" : "openai-responses",
          model: config.model,
          promptVersion: config.promptVersion,
          postId: post.id,
          sourceId: post.sourceId,
          cachedAt: new Date().toISOString(),
          impacts: normalizedImpacts
        };
        liveMappings += 1;
      }
    } catch (error) {
      failureCount += postBatch.length;
      warnings.push(error instanceof Error ? error.message : "Impact-mapping request failed.");

      for (const post of postBatch) {
        impacts.set(post.id, []);
      }
    }
  }

  if (useCache && Object.keys(nextCacheEntries).length) {
    upsertImpactMappingCache(nextCacheEntries);
    cacheWrites = Object.keys(nextCacheEntries).length;
  }

  return {
    impacts,
    stats: {
      requestedMode: config.requestedMode,
      activeMode: config.activeMode,
      provider: config.provider,
      model: config.model,
      promptVersion: config.promptVersion,
      candidateCount: candidateUniverse.length,
      cacheHits,
      cacheWrites,
      liveMappings,
      failureCount
    },
    promptGuide: buildPromptGuide(),
    warnings
  };
}

export async function buildImpactMappingReplay({
  post,
  sources,
  financialProfile = {},
  generatedAt,
  live = false
}) {
  const config = getImpactMapperConfig();
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const requestEnvelope = buildImpactMappingRequest({
    posts: [post],
    sources,
    generatedAt,
    financialProfile,
    config
  });
  const source = sourceMap.get(post.sourceId) || {};
  const fingerprint = buildImpactMappingFingerprint({
    promptVersion: config.promptVersion,
    model: config.model,
    post,
    source,
    candidateUniverse: requestEnvelope.candidateUniverse
  });
  const cacheStore = readImpactMappingCache();
  let cachedEntry = cacheStore.entries[fingerprint] || null;
  const candidateSet = new Set(requestEnvelope.candidateUniverse.map((asset) => asset.ticker));
  let liveRun = null;

  if (live && config.activeMode === "openai") {
    try {
      const liveResponse = await requestOpenAIImpactMappings(
        [post],
        sourceMap,
        generatedAt,
        financialProfile,
        config
      );

      liveRun = {
        ok: true,
        parsedImpacts: normalizeImpactItems(liveResponse.items[0]?.likelyImpacts, candidateSet),
        rawText: liveResponse.rawText,
        rawResponse: liveResponse.rawResponse
      };
      cachedEntry = {
        provider: config.provider === "local_openai_compatible" ? "local-openai-compatible" : "openai-responses",
        model: config.model,
        promptVersion: config.promptVersion,
        postId: post.id,
        sourceId: post.sourceId,
        cachedAt: new Date().toISOString(),
        impacts: liveRun.parsedImpacts
      };
      upsertImpactMappingCache({
        [fingerprint]: cachedEntry
      });
    } catch (error) {
      liveRun = {
        ok: false,
        error: error instanceof Error ? error.message : "Live impact-mapping request failed."
      };
    }
  }

  return {
    promptGuide: buildPromptGuide(),
    config: getSafeConfig(config),
    fingerprint,
    cache: {
      hit: Boolean(cachedEntry),
      entry: cachedEntry,
      parsedImpacts: normalizeImpactItems(cachedEntry?.impacts, candidateSet)
    },
    validationReady: {
      liveEligible: config.activeMode === "openai",
      candidateCount: requestEnvelope.candidateUniverse.length
    },
    requestEnvelope,
    liveRun
  };
}
