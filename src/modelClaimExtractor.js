import {
  buildExtractionFingerprint,
  readExtractionCache,
  upsertExtractionCache
} from "./extractionCacheStore.js";

const EXTRACTOR_PROMPT_VERSION = "claim-extractor-v1";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
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

export function getClaimExtractorConfig() {
  const requestedMode = normalizeMode((process.env.CLAIM_EXTRACTION_MODE || "auto").toLowerCase());
  const apiKey = process.env.OPENAI_API_KEY || "";
  const activeMode =
    requestedMode === "heuristic"
      ? "heuristic"
      : apiKey
        ? "openai"
        : "heuristic";

  return {
    requestedMode,
    activeMode,
    apiKey,
    baseUrl: OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
  };
}

function getSafeConfig(config) {
  return {
    requestedMode: config.requestedMode,
    activeMode: config.activeMode,
    baseUrl: config.baseUrl,
    model: config.model
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

export function getClaimExtractionSchema() {
  return claimExtractionSchema;
}

export function getClaimExtractionPromptVersion() {
  return EXTRACTOR_PROMPT_VERSION;
}

function buildInstructions() {
  return [
    "You extract structured investment-claim signals from short X posts for a narrow AI, tech, and crypto monitoring product.",
    "Return exactly one extraction object per input post and keep the original postId.",
    "topicHint must identify the closest narrative family and should be conservative when the post is mostly noise or clarification.",
    "actionable should be false for rumor control, debunks, stale commentary, generic macro chatter, or posts that are not asset-relevant enough to trade on.",
    "mappedAssets must stay inside the source allowedAssets list and should be empty or narrow when the mapping is weak.",
    "If uncertain, prefer Neutral or Mixed, actionable false, and lower confidence.",
    "confidence should be a number between 0 and 1.",
    "Themes should be short, factual phrases rather than summaries.",
    "extractionNote should briefly explain the dominant reason for the classification."
  ].join(" ");
}

function buildUserPrompt(posts, sourceMap, generatedAt) {
  return JSON.stringify(
    {
      generatedAt,
      monitoredAssets: allowedAssets,
      posts: buildBatchPayload(posts, sourceMap)
    },
    null,
    2
  );
}

export function buildClaimExtractionRequest({ posts, sources, generatedAt, config = getClaimExtractorConfig() }) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));

  return {
    promptVersion: EXTRACTOR_PROMPT_VERSION,
    config: getSafeConfig(config),
    instructions: buildInstructions(),
    schema: claimExtractionSchema,
    batchPayload: buildBatchPayload(posts, sourceMap),
    requestBody: {
      model: config.model,
      store: false,
      instructions: buildInstructions(),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildUserPrompt(posts, sourceMap, generatedAt)
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

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const texts = [];

  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "refusal") {
        throw new Error(content.refusal || "OpenAI model refused the extraction request.");
      }

      if (typeof content.text === "string" && content.text.trim()) {
        texts.push(content.text);
      } else if (content.text && typeof content.text === "object" && typeof content.text.value === "string") {
        texts.push(content.text.value);
      }
    }
  }

  if (!texts.length) {
    throw new Error("No structured extraction payload was returned by the model.");
  }

  return texts.join("\n").trim();
}

async function requestOpenAIExtractions(posts, sourceMap, generatedAt, config, { includeRaw = false } = {}) {
  const requestEnvelope = buildClaimExtractionRequest({
    posts,
    sources: [...sourceMap.values()],
    generatedAt,
    config
  });
  const response = await fetch(`${config.baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(requestEnvelope.requestBody)
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI request failed with ${response.status}.`);
  }

  const rawText = extractOutputText(payload);
  const parsed = JSON.parse(rawText);
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  if (includeRaw) {
    return {
      items,
      rawText,
      rawResponse: payload,
      requestEnvelope
    };
  }

  return {
    items
  };
}

export async function extractClaimsForPosts({ posts, sources, generatedAt }) {
  const config = getClaimExtractorConfig();
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const extractions = new Map();
  const warnings = [];
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
        cacheHits,
        liveExtractions,
        cacheWrites,
        fallbackCount: posts.length
      },
      warnings
    };
  }

  const cacheStore = readExtractionCache();
  const nextCacheEntries = {};
  const pendingPosts = [];

  for (const post of posts) {
    const source = sourceMap.get(post.sourceId) || {};
    const fingerprint = buildExtractionFingerprint({
      promptVersion: EXTRACTOR_PROMPT_VERSION,
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
          provider: "openai-responses",
          model: config.model,
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

  if (Object.keys(nextCacheEntries).length) {
    upsertExtractionCache(nextCacheEntries);
    cacheWrites = Object.keys(nextCacheEntries).length;
  }

  return {
    extractions,
    stats: {
      requestedMode: config.requestedMode,
      activeMode: "openai",
      provider: "openai-responses",
      model: config.model,
      cacheHits,
      liveExtractions,
      cacheWrites,
      fallbackCount
    },
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
    promptVersion: EXTRACTOR_PROMPT_VERSION,
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
    promptVersion: EXTRACTOR_PROMPT_VERSION,
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
