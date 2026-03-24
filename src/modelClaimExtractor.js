import {
  buildExtractionFingerprint,
  readExtractionCache,
  upsertExtractionCache
} from "./extractionCacheStore.js";
import { requestStructuredResponse, resolveLlmConfig } from "./llmClient.js";

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_PROMPT_VERSION = "claim-extractor-v2";
const CLAIM_EXTRACTION_BATCH_SIZE = 8;

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
const allowedTopicHints = [
  "cluster-accelerators",
  "cluster-enterprise-ai",
  "cluster-policy-noise",
  "cluster-crypto-risk"
];
const allowedAssets = ["NVDA", "AMD", "TSM", "MSFT", "META", "SOXX", "QQQ", "BTC"];

const promptExamples = [
  {
    id: "prompt-example-accelerators",
    label: "Accelerator demand remains firm",
    sourceHandle: "@semiflow",
    body:
      "Board checks still point to hyperscalers pulling forward AI rack deployments into next quarter. That keeps upstream semi orders tighter than the market narrative implies.",
    expected: {
      topicHint: "cluster-accelerators",
      claimType: "Channel check",
      direction: "Bullish",
      explicitness: "Explicit",
      actionable: true,
      mappedAssets: ["NVDA", "TSM", "SOXX"],
      extractionNote: "Direct channel-check language supports the accelerator-demand cluster."
    }
  },
  {
    id: "prompt-example-enterprise",
    label: "Enterprise tone improves but proof still matters",
    sourceHandle: "@builderalpha",
    body:
      "Enterprise buyers are talking AI copilots again, but budget owners still want proof of ROI before expanding seats. Demand tone is better, conversion is still lumpy.",
    expected: {
      topicHint: "cluster-enterprise-ai",
      claimType: "Operator commentary",
      direction: "Mixed",
      explicitness: "Interpretive",
      actionable: true,
      mappedAssets: ["MSFT", "META", "QQQ"],
      extractionNote: "Enterprise deployment and seat-expansion language creates a broad software read-through, but ROI proof remains unresolved."
    }
  },
  {
    id: "prompt-example-noise",
    label: "Policy rumor should be downgraded",
    sourceHandle: "@policywire",
    body:
      "The loud procurement rumor going around X still has no attached draft language or committee backing. Treat the move as narrative until evidence appears.",
    expected: {
      topicHint: "cluster-policy-noise",
      claimType: "Debunk / clarification",
      direction: "Neutral",
      explicitness: "Explicit",
      actionable: false,
      mappedAssets: ["AMD", "QQQ"],
      extractionNote: "This is clarification and rumor control, not a tradeable catalyst."
    }
  },
  {
    id: "prompt-example-crypto",
    label: "Crypto setup remains constructive but messy",
    sourceHandle: "@chainpulse",
    body:
      "BTC is catching some of the same liquidity bid as AI beta, but derivatives positioning is no longer clean. Good backdrop, messy trigger.",
    expected: {
      topicHint: "cluster-crypto-risk",
      claimType: "Market desk note",
      direction: "Mixed",
      explicitness: "Interpretive",
      actionable: true,
      mappedAssets: ["BTC"],
      extractionNote: "Constructive backdrop is offset by crowded derivatives, keeping the signal mixed."
    }
  },
  {
    id: "prompt-example-policy-interpretation",
    label: "Policy language narrows instead of broadening risk",
    sourceHandle: "@policywire",
    body:
      "Fresh export-language read: the latest language still looks narrower than feared on AI compute and nothing here looks like a broad stop sign for AI infrastructure spending.",
    expected: {
      topicHint: "cluster-accelerators",
      claimType: "Policy interpretation",
      direction: "Bullish",
      explicitness: "Interpretive",
      actionable: true,
      mappedAssets: ["NVDA", "TSM", "SOXX", "QQQ"],
      extractionNote: "This is a real policy interpretation with positive operating read-through, not rumor-control noise."
    }
  },
  {
    id: "prompt-example-software-caution",
    label: "Software tone improves but still stops short of BUY",
    sourceHandle: "@macrolens",
    body:
      "Growth leadership keeps rotating back toward software without a rates scare, but the move still looks broad, valuation-sensitive, and not enough to upgrade QQQ on its own.",
    expected: {
      topicHint: "cluster-enterprise-ai",
      claimType: "Macro context",
      direction: "Mixed",
      explicitness: "Interpretive",
      actionable: true,
      mappedAssets: ["QQQ"],
      extractionNote: "The setup is constructive enough to monitor, but the post still argues for patience rather than a directional upgrade."
    }
  },
  {
    id: "prompt-example-semiconductor-rotation",
    label: "Semis are cleaner than broad software",
    sourceHandle: "@macrolens",
    body:
      "Growth leadership keeps rotating back toward software without a rates scare, but semis still have the cleaner social-signal setup and remain the better continuation expression.",
    expected: {
      topicHint: "cluster-accelerators",
      claimType: "Macro context",
      direction: "Mixed",
      explicitness: "Interpretive",
      actionable: true,
      mappedAssets: ["SOXX", "QQQ"],
      extractionNote: "This is a broad macro read that still centers semis as the cleaner setup, so it should map to SOXX plus the broad-tech read-through."
    }
  },
  {
    id: "prompt-example-macro-reality-check",
    label: "Macro source can still invalidate a rumor",
    sourceHandle: "@macrolens",
    body:
      "Macro reality check: the move still looks narrative-driven, verification failed to show up, and the catalyst still looks more social than operational.",
    expected: {
      topicHint: "cluster-policy-noise",
      claimType: "Macro context",
      direction: "Neutral",
      explicitness: "Interpretive",
      actionable: false,
      mappedAssets: ["QQQ"],
      extractionNote: "Even from a macro source, failed verification and narrative-driven language should stay policy-noise rather than become a fresh catalyst."
    }
  },
  {
    id: "prompt-example-macro-crypto-spillover",
    label: "Cross-market crypto spillover can stay macro context",
    sourceHandle: "@macrolens",
    body:
      "Cross-market note: BTC is still getting help from the same liquidity impulse lifting AI beta, but confirmation still matters more here.",
    expected: {
      topicHint: "cluster-crypto-risk",
      claimType: "Macro context",
      direction: "Mixed",
      explicitness: "Interpretive",
      actionable: true,
      mappedAssets: ["QQQ", "BTC"],
      extractionNote: "This is cross-market macro framing for crypto risk, not a desk-style derivatives or positioning note."
    }
  },
  {
    id: "prompt-example-clean-semis-leadership",
    label: "Semis leadership can stay accelerator bullish",
    sourceHandle: "@macrolens",
    body:
      "Tape read: semis are still leading the growth complex without a rates shock getting in the way, and that remains a better backdrop for continuation than for fading strength.",
    expected: {
      topicHint: "cluster-accelerators",
      claimType: "Macro context",
      direction: "Bullish",
      explicitness: "Interpretive",
      actionable: true,
      mappedAssets: ["SOXX", "QQQ"],
      extractionNote: "Leadership and rates framing make this macro context for accelerator continuation, not generic software commentary."
    }
  }
];

const promptVariants = {
  "claim-extractor-v1": {
    label: "Baseline extraction prompt",
    goal:
      "Classify short X posts into a narrow claim schema for downstream deterministic clustering and policy.",
    instructions: [
      "Return exactly one extraction object per input post and preserve the original postId.",
      "topicHint must identify the closest narrative family and should stay conservative when the post is mostly noise or clarification.",
      "actionable should be false for rumor control, debunks, stale commentary, generic macro chatter, or posts that are not asset-relevant enough to trade on.",
      "mappedAssets must stay inside the source allowedAssets list and should be empty or narrow when the mapping is weak.",
      "Use broad proxies only when the text supports them: QQQ for broad growth or software read-through, SOXX for broad semis or supply-chain read-through. Do not add them automatically.",
      "Do not map MSFT or META from generic software-strength language alone. Use them when the post is really about enterprise AI deployment, copilots, ROI, seats, or platform monetization.",
      "If uncertain, prefer Neutral or Mixed, actionable false, and lower confidence.",
      "Themes should be short factual phrases rather than summaries.",
      "extractionNote should briefly explain the dominant reason for the classification."
    ],
    validationFocus: [
      "Do not confuse clarification with a fresh catalyst.",
      "Do not over-map weak single-name references into too many assets.",
      "Use broad proxies only when the post actually implies a broad read-through."
    ]
  },
  "claim-extractor-v2": {
    label: "Tuned extraction prompt with calibration examples",
    goal:
      "Produce conservative, high-precision claim objects that can be trusted by the deterministic cluster and decision engine.",
    instructions: [
      "Treat the task as classification, not creative summarization. Pick the closest allowed label and avoid adding interpretation that is not present in the post.",
      "Prefer false negatives over false positives. If the post reads like rumor control, stale commentary, or broad vibes without a real operating implication, mark actionable false.",
      "Use Bullish or Bearish only when the directional implication is genuinely strong. Mixed is preferred for posts that contain support and caveats together.",
      "Use Macro context for cross-asset leadership, liquidity, rates, breadth, or market-backdrop framing. Use Market desk note for desk-style flow, positioning, leverage, or derivatives commentary.",
      "Policy or rumor-control posts should usually become cluster-policy-noise unless they clearly change the operating environment.",
      "Macro reality-check posts that say verification failed, the move is narrative-driven, or the catalyst is more social than operational should still land in cluster-policy-noise even when the source is macro-oriented.",
      "Enterprise-AI posts require evidence of deployment, budget, or monetization. Product hype alone should not become a strong bullish extraction.",
      "Map MSFT and META for enterprise-AI only when the post contains copilots, deployment, seat expansion, workflow adoption, budget, ROI, or monetization clues. Generic software or growth rotation alone should stay broad and usually map to QQQ, not single names.",
      "When semis are described as the cleaner setup than software or broad growth, keep the cluster on accelerators and map SOXX plus any explicit broad-tech proxy like QQQ.",
      "Crypto posts should stay conservative when derivatives, leverage, or volatility language is present.",
      "Map only assets that the source is allowed to influence and keep the asset list narrow when the read-through is indirect.",
      "Use QQQ only for broad market read-through language such as growth, software leadership, risk appetite, or rates-scare framing. Do not add QQQ automatically to every enterprise or accelerator post."
    ],
    validationFocus: [
      "High precision on policy-noise detection.",
      "Avoid forcing BUY-like sentiment out of mixed enterprise or crypto language.",
      "Keep asset mappings aligned with source permissions and direct narrative exposure.",
      "Macro software-rotation notes that still say semis are cleaner should stay accelerator-cluster, not drift into enterprise-ai.",
      "Weak asset mappings should stay narrow rather than defaulting to every cluster beneficiary."
    ]
  }
};

const claimExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "postId",
          "topicHint",
          "claimType",
          "direction",
          "explicitness",
          "actionable",
          "confidence",
          "themes",
          "mappedAssets",
          "extractionNote"
        ],
        properties: {
          postId: {
            type: "string"
          },
          topicHint: {
            type: "string",
            enum: allowedTopicHints
          },
          claimType: {
            type: "string",
            enum: allowedClaimTypes
          },
          direction: {
            type: "string",
            enum: allowedDirections
          },
          explicitness: {
            type: "string",
            enum: allowedExplicitness
          },
          actionable: {
            type: "boolean"
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1
          },
          themes: {
            type: "array",
            items: {
              type: "string"
            },
            maxItems: 3
          },
          mappedAssets: {
            type: "array",
            items: {
              type: "string",
              enum: allowedAssets
            },
            maxItems: 4
          },
          extractionNote: {
            type: "string"
          }
        }
      }
    }
  }
};

function normalizeMode(value) {
  if (value === "heuristic" || value === "openai") {
    return value;
  }

  return "auto";
}

function normalizePromptVersion(value) {
  return promptVariants[value] ? value : DEFAULT_PROMPT_VERSION;
}

function getActivePromptVariant() {
  const version = normalizePromptVersion(
    String(process.env.CLAIM_EXTRACTION_PROMPT_VERSION || DEFAULT_PROMPT_VERSION).trim()
  );

  return {
    version,
    ...promptVariants[version]
  };
}

export function getClaimExtractorConfig() {
  const requestedMode = normalizeMode((process.env.CLAIM_EXTRACTION_MODE || "auto").toLowerCase());
  const llmConfig = resolveLlmConfig({
    modelEnvVar: "OPENAI_MODEL",
    defaultModel: DEFAULT_OPENAI_MODEL
  });
  const activeMode =
    requestedMode === "heuristic"
      ? "heuristic"
      : llmConfig.provider === "local_openai_compatible" || llmConfig.apiKey
        ? "openai"
        : "heuristic";
  const promptVariant = getActivePromptVariant();

  return {
    requestedMode,
    activeMode,
    apiKey: llmConfig.apiKey,
    baseUrl: llmConfig.baseUrl,
    provider: llmConfig.provider,
    model: llmConfig.model,
    promptVersion: promptVariant.version,
    promptLabel: promptVariant.label
  };
}

function getSafeConfig(config) {
  return {
    requestedMode: config.requestedMode,
    activeMode: config.activeMode,
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    promptVersion: config.promptVersion,
    promptLabel: config.promptLabel
  };
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function buildBatchPayload(posts, sourceMap) {
  return posts.map((post) => {
    const source = sourceMap.get(post.sourceId);

    return {
      postId: post.id,
      createdAt: post.createdAt,
      body: post.body,
      source: {
        id: source?.id || post.sourceId,
        handle: source?.handle || "",
        category: source?.category || "Operator / Custom",
        baselineReliability: source?.baselineReliability ?? 0.6,
        allowedAssets: source?.allowedAssets || allowedAssets,
        relevantSectors: source?.relevantSectors || [],
        tone: source?.tone || "Custom"
      }
    };
  });
}

function getPromptGuide(promptVariant = getActivePromptVariant()) {
  return {
    version: promptVariant.version,
    label: promptVariant.label,
    goal: promptVariant.goal,
    instructions: promptVariant.instructions,
    validationFocus: promptVariant.validationFocus,
    examples: promptExamples
  };
}

export function getClaimExtractionSchema() {
  return claimExtractionSchema;
}

export function getClaimExtractionPromptVersion() {
  return getActivePromptVariant().version;
}

export function getClaimExtractionPromptGuide() {
  return getPromptGuide();
}

export function listClaimExtractionPromptVersions() {
  return Object.keys(promptVariants);
}

function buildInstructions(promptVariant) {
  return [
    "You extract structured investment-claim signals from short X posts for a narrow AI, tech, and crypto monitoring product.",
    promptVariant.goal,
    ...promptVariant.instructions,
    `Validation focus: ${promptVariant.validationFocus.join(" ")}`
  ].join(" ");
}

function buildUserPrompt(posts, sourceMap, generatedAt, promptVariant) {
  return JSON.stringify(
    {
      generatedAt,
      promptVersion: promptVariant.version,
      monitoredAssets: allowedAssets,
      labelTaxonomy: {
        topicHint: allowedTopicHints,
        claimType: allowedClaimTypes,
        direction: allowedDirections,
        explicitness: allowedExplicitness
      },
      calibrationExamples: promptExamples,
      posts: buildBatchPayload(posts, sourceMap)
    },
    null,
    2
  );
}

export function buildClaimExtractionRequest({
  posts,
  sources,
  generatedAt,
  config = getClaimExtractorConfig()
}) {
  const promptVariant = getActivePromptVariant();
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const instructions = buildInstructions(promptVariant);
  const inputText = buildUserPrompt(posts, sourceMap, generatedAt, promptVariant);

  return {
    promptVersion: promptVariant.version,
    promptGuide: getPromptGuide(promptVariant),
    config: getSafeConfig(config),
    instructions,
    inputText,
    schema: claimExtractionSchema,
    batchPayload: buildBatchPayload(posts, sourceMap),
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
          name: "tweet_claim_extractions",
          strict: true,
          schema: claimExtractionSchema
        }
      }
    }
  };
}

async function requestOpenAIExtractions(posts, sourceMap, generatedAt, config, { includeRaw = false } = {}) {
  const requestEnvelope = buildClaimExtractionRequest({
    posts,
    sources: [...sourceMap.values()],
    generatedAt,
    config
  });
  const response = await requestStructuredResponse({
    config,
    instructions: requestEnvelope.requestBody.instructions,
    inputText: requestEnvelope.inputText,
    schema: claimExtractionSchema,
    schemaName: "tweet_claim_extractions",
    emptyOutputMessage: "No structured extraction payload was returned by the model.",
    requestErrorMessage: "Extraction request failed."
  });
  const rawText = response.outputText;
  const parsed = JSON.parse(rawText);
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  if (includeRaw) {
    return {
      items,
      rawText,
      rawResponse: response.payload,
      requestEnvelope
    };
  }

  return {
    items,
    requestEnvelope
  };
}

export async function extractClaimsForPosts({
  posts,
  sources,
  generatedAt,
  useCache = true
}) {
  const config = getClaimExtractorConfig();
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const extractions = new Map();
  const warnings = [];
  const promptGuide = getPromptGuide();
  let cacheHits = 0;
  let liveExtractions = 0;
  let fallbackCount = 0;
  let cacheWrites = 0;

  if (config.activeMode !== "openai") {
    return {
      extractions,
      stats: {
        requestedMode: config.requestedMode,
        activeMode: "heuristic",
        provider: "heuristic-fallback",
        model: "",
        promptVersion: config.promptVersion,
        promptLabel: config.promptLabel,
        cacheHits,
        liveExtractions,
        cacheWrites,
        fallbackCount: posts.length
      },
      promptGuide,
      warnings
    };
  }

  const cacheStore = useCache ? readExtractionCache() : { entries: {} };
  const nextCacheEntries = {};
  const pendingPosts = [];

  for (const post of posts) {
    const source = sourceMap.get(post.sourceId) || {};
    const fingerprint = buildExtractionFingerprint({
      promptVersion: config.promptVersion,
      model: config.model,
      post,
      source
    });
    const cachedEntry = cacheStore.entries[fingerprint];

    if (cachedEntry?.extraction) {
      extractions.set(post.id, cachedEntry.extraction);
      cacheHits += 1;
      continue;
    }

    pendingPosts.push({
      ...post,
      _fingerprint: fingerprint
    });
  }

  for (const postBatch of chunk(pendingPosts, CLAIM_EXTRACTION_BATCH_SIZE)) {
    try {
      const batchResponse = await requestOpenAIExtractions(postBatch, sourceMap, generatedAt, config);
      const extractionByPostId = new Map(batchResponse.items.map((item) => [item.postId, item]));

      for (const post of postBatch) {
        const extraction = extractionByPostId.get(post.id);

        if (!extraction) {
          fallbackCount += 1;
          continue;
        }

        extractions.set(post.id, extraction);
        nextCacheEntries[post._fingerprint] = {
          provider: config.provider === "local_openai_compatible" ? "local-openai-compatible" : "openai-responses",
          model: config.model,
          promptVersion: config.promptVersion,
          postId: post.id,
          sourceId: post.sourceId,
          cachedAt: new Date().toISOString(),
          extraction
        };
        liveExtractions += 1;
      }
    } catch (error) {
      fallbackCount += postBatch.length;
      warnings.push(
        error instanceof Error
          ? error.message
          : "OpenAI extraction failed; falling back to the deterministic heuristic extractor."
      );
    }
  }

  if (useCache && Object.keys(nextCacheEntries).length) {
    upsertExtractionCache(nextCacheEntries);
    cacheWrites = Object.keys(nextCacheEntries).length;
  }

  return {
    extractions,
    stats: {
      requestedMode: config.requestedMode,
      activeMode: "openai",
      provider: config.provider === "local_openai_compatible" ? "local-openai-compatible" : "openai-responses",
      model: config.model,
      promptVersion: config.promptVersion,
      promptLabel: config.promptLabel,
      cacheHits,
      liveExtractions,
      cacheWrites,
      fallbackCount
    },
    promptGuide,
    warnings
  };
}

export async function buildClaimExtractionReplay({ post, sources, generatedAt, live = false }) {
  const config = getClaimExtractorConfig();
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const source = sourceMap.get(post.sourceId) || {};
  const requestEnvelope = buildClaimExtractionRequest({
    posts: [post],
    sources,
    generatedAt,
    config
  });
  const fingerprint = buildExtractionFingerprint({
    promptVersion: config.promptVersion,
    model: config.model,
    post,
    source
  });
  const cacheStore = readExtractionCache();
  const cachedEntry = cacheStore.entries[fingerprint] || null;
  let liveRun = null;

  if (live && config.activeMode === "openai") {
    try {
      const liveResponse = await requestOpenAIExtractions([post], sourceMap, generatedAt, config, {
        includeRaw: true
      });

      liveRun = {
        ok: true,
        parsedExtraction: liveResponse.items[0] || null,
        rawText: liveResponse.rawText,
        rawResponse: liveResponse.rawResponse
      };
    } catch (error) {
      liveRun = {
        ok: false,
        error: error instanceof Error ? error.message : "Live extraction request failed."
      };
    }
  }

  return {
    promptVersion: config.promptVersion,
    promptGuide: requestEnvelope.promptGuide,
    validationReady: {
      liveEligible: config.activeMode === "openai",
      exampleCount: requestEnvelope.promptGuide.examples.length,
      promptVersions: listClaimExtractionPromptVersions()
    },
    config: getSafeConfig(config),
    fingerprint,
    cache: {
      hit: Boolean(cachedEntry),
      entry: cachedEntry
    },
    requestEnvelope,
    liveRun
  };
}
