import { getLinkedinDraft, persistLinkedinDraft } from "./linkedinDraftStore.js";
import { requestStructuredResponse, resolveLlmConfig } from "./llmClient.js";
import { buildMediaSummary, resolveXPost } from "./xPostResolver.js";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "openai/gpt-5-mini";
const DEFAULT_VOICE = "professional";
const VOICE_GUIDES = {
  professional: "Crisp, credible, and useful for a broad professional audience.",
  operator: "Practical, informed, and slightly opinionated without sounding hypey.",
  founder: "Forward-looking and energetic, but still grounded in real implications."
};

const WRITER_CONTEXT = [
  "Writer identity: the user is an independent LinkedIn creator building a personal brand.",
  "Do not write as the source author or imply affiliation with the source account.",
  "Frame the source as something the user saw or read, then add the user's own take.",
  "Prefer framing like 'I came across this post' or 'What stood out to me' over source-centered phrasing.",
  "Keep the tone smart, practical, and personal without sounding self-important."
];
const LINKEDIN_REWRITE_PRESETS = [
  {
    id: "builder-voice",
    label: "Builder Voice",
    instruction:
      "Rewrite this in my voice as an independent builder sharing a thoughtful take after reading the source."
  },
  {
    id: "stronger-hook",
    label: "Stronger Hook",
    instruction:
      "Make the opening hook stronger and more scroll-stopping without sounding salesy, breathless, or overhyped."
  },
  {
    id: "shorter-post",
    label: "120-180 Words",
    instruction:
      "Tighten this into a concise LinkedIn post in the 120 to 180 word range while preserving the strongest insight."
  },
  {
    id: "operator-lesson",
    label: "Operator Lesson",
    instruction:
      "Turn this into a practical operator lesson with a clearer takeaway for founders, product, or engineering leaders."
  },
  {
    id: "more-opinionated",
    label: "More Opinionated",
    instruction:
      "Make this more opinionated and memorable while staying credible, grounded, and factually faithful to the source."
  }
];
const LINKEDIN_HELPER_TOOLS = [
  "Pillar filters so you can browse drafts by personal-brand topic instead of source account.",
  "Rewrite presets for stronger hooks, tighter posts, and more founder or operator framing.",
  "Version history so each rewrite stays reviewable instead of overwriting the original.",
  "Brand linting to flag source-echoing, corporate tone, or weak hooks before posting.",
  "A repetition detector to avoid posting the same angle too often."
];

const LINKEDIN_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "hook", "bodyParagraphs", "cta", "hashtags"],
  properties: {
    headline: {
      type: "string",
      minLength: 12,
      maxLength: 120
    },
    hook: {
      type: "string",
      minLength: 18,
      maxLength: 220
    },
    bodyParagraphs: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "string",
        minLength: 18,
        maxLength: 420
      }
    },
    cta: {
      type: "string",
      minLength: 12,
      maxLength: 220
    },
    hashtags: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "string",
        minLength: 2,
        maxLength: 32
      }
    }
  }
};

function normalizeVoice(value) {
  const normalizedVoice = String(value || DEFAULT_VOICE).trim().toLowerCase();
  return VOICE_GUIDES[normalizedVoice] ? normalizedVoice : DEFAULT_VOICE;
}

function canUseModel(config) {
  return config.provider === "local_openai_compatible" || Boolean(config.apiKey);
}

function cleanText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeInstructions(value) {
  return cleanText(value);
}

function buildManualSource({ manualText, manualAuthor, manualMediaNotes, xUrl }) {
  return {
    type: "manual",
    xUrl: String(xUrl || "").trim(),
    canonicalUrl: "",
    postId: "",
    extractionMethod: "manual",
    authorName: String(manualAuthor || "").trim(),
    authorHandle: "",
    createdAt: "",
    text: cleanText(manualText),
    links: [],
    media: [],
    mediaSummary: manualMediaNotes ? "Manual media notes supplied" : "No media attached",
    manualMediaNotes: cleanText(manualMediaNotes)
  };
}

function normalizeHashtag(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^A-Za-z0-9]/g, "");

  return cleaned ? `#${cleaned}` : "";
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFullPost(draft) {
  const sections = [
    cleanText(draft.hook),
    ...draft.bodyParagraphs.map((item) => cleanText(item)).filter(Boolean),
    cleanText(draft.cta)
  ].filter(Boolean);
  const hashtags = draft.hashtags.map((item) => normalizeHashtag(item)).filter(Boolean).join(" ");

  return [sections.join("\n\n"), hashtags].filter(Boolean).join("\n\n").trim();
}

function buildSourceLabel(source = {}) {
  return cleanText(source.authorHandle || source.authorName || source.xUrl || "Manual source");
}

function firstNonEmptySentence(text) {
  return (
    cleanText(text)
      .split(/(?<=[.!?])\s+/)
      .map((item) => item.trim())
      .find(Boolean) || ""
  );
}

function truncate(value, maxLength) {
  const text = cleanText(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildKeywordHashtags(text) {
  const normalizedText = String(text || "").toLowerCase();
  const hashtags = [];

  if (/llm|language model|inference|prompt|cache|quant/i.test(normalizedText)) {
    hashtags.push("#LLM", "#AIInfrastructure");
  }

  if (/research|paper|blog|benchmark/i.test(normalizedText)) {
    hashtags.push("#AIResearch");
  }

  if (/speed|latency|memory|efficiency|compression/i.test(normalizedText)) {
    hashtags.push("#Efficiency", "#MachineLearning");
  }

  if (!hashtags.length) {
    hashtags.push("#AI", "#Technology", "#Product");
  }

  return [...new Set(hashtags)].slice(0, 5);
}

function buildLibraryTags(text, source = {}) {
  const normalizedText = String(text || "").toLowerCase();
  const tags = [];

  if (/llm|language model|kv cache|inference|model serving|token/.test(normalizedText)) {
    tags.push("llm", "inference");
  }

  if (/memory|compression|quant|latency|throughput|efficiency/.test(normalizedText)) {
    tags.push("efficiency");
  }

  if (/research|paper|benchmark|blog/.test(normalizedText)) {
    tags.push("research");
  }

  if (/product|copilot|adoption|enterprise|roadmap/.test(normalizedText)) {
    tags.push("product");
  }

  if (/founder|go-to-market|distribution|customer|pricing/.test(normalizedText)) {
    tags.push("founder");
  }

  if (source.type === "x-post") {
    tags.push("x-sourced");
  }

  return [...new Set(tags)].slice(0, 6);
}

function deriveTopic(text) {
  const normalizedText = String(text || "").toLowerCase();

  if (/cache|memory|quant|compression/.test(normalizedText)) {
    return "LLM efficiency";
  }

  if (/inference|latency|speed/.test(normalizedText)) {
    return "faster inference";
  }

  if (/research|paper|benchmark|blog/.test(normalizedText)) {
    return "AI research with practical impact";
  }

  return "AI execution";
}

function derivePillar(text) {
  const normalizedText = String(text || "").toLowerCase();

  if (/cache|memory|quant|compression|latency|throughput|serving|gpu|inference/.test(normalizedText)) {
    return {
      id: "ai-efficiency",
      label: "AI Efficiency"
    };
  }

  if (/product|copilot|workflow|roadmap|adoption|enterprise/.test(normalizedText)) {
    return {
      id: "product-strategy",
      label: "Product Strategy"
    };
  }

  if (/lesson|takeaway|what i learned|operator|playbook/.test(normalizedText)) {
    return {
      id: "engineering-lessons",
      label: "Engineering Lessons"
    };
  }

  if (/founder|market|pricing|distribution|customer|go-to-market/.test(normalizedText)) {
    return {
      id: "founder-updates",
      label: "Founder Updates"
    };
  }

  return {
    id: "operator-commentary",
    label: "Operator Commentary"
  };
}

function deriveFormat({ parentDraftId = "", instructions = "", draft = {} } = {}) {
  const normalizedText = `${draft.headline || ""}\n${draft.fullPost || ""}\n${instructions || ""}`.toLowerCase();

  if (parentDraftId) {
    return {
      id: "rewrite",
      label: "Rewrite"
    };
  }

  if (/lesson|takeaway|what i learned|do this/.test(normalizedText)) {
    return {
      id: "lesson",
      label: "Lesson"
    };
  }

  if (/contrarian|skeptical|caution|warning/.test(normalizedText)) {
    return {
      id: "contrarian-take",
      label: "Contrarian Take"
    };
  }

  if (/case study|example|experiment/.test(normalizedText)) {
    return {
      id: "case-study",
      label: "Case Study"
    };
  }

  return {
    id: "insight",
    label: "Insight"
  };
}

function deriveIntent({ voice, instructions = "" } = {}) {
  const normalizedInstructions = String(instructions || "").toLowerCase();

  if (/feedback|discussion|what do you think|question/.test(normalizedInstructions)) {
    return {
      id: "ask-for-feedback",
      label: "Ask For Feedback"
    };
  }

  if (voice === "operator") {
    return {
      id: "educate",
      label: "Educate"
    };
  }

  if (voice === "founder") {
    return {
      id: "provoke-discussion",
      label: "Provoke Discussion"
    };
  }

  return {
    id: "build-credibility",
    label: "Build Credibility"
  };
}

function buildDraftRecord({
  source,
  draft,
  voice,
  origin,
  warnings = [],
  instructions = "",
  parentDraftId = "",
  rootDraftId = "",
  revisionNumber = 1
}) {
  const normalizedInstructions = normalizeInstructions(instructions);
  const combinedText = [draft?.headline, draft?.fullPost, source?.text].filter(Boolean).join("\n");
  const pillar = derivePillar(combinedText);
  const format = deriveFormat({
    parentDraftId,
    instructions: normalizedInstructions,
    draft
  });
  const intent = deriveIntent({
    voice,
    instructions: normalizedInstructions
  });
  const createdAt = new Date().toISOString();

  return {
    status: "ready",
    createdAt,
    updatedAt: createdAt,
    origin: String(origin || "ui").trim(),
    voice,
    warnings,
    source,
    draft,
    library: {
      pillar,
      format,
      intent,
      status: parentDraftId ? "rewritten" : "draft",
      sourceType: String(source?.type || "manual"),
      sourceLabel: buildSourceLabel(source),
      tags: buildLibraryTags(combinedText, source),
      rootDraftId: String(rootDraftId || "").trim(),
      parentDraftId: String(parentDraftId || "").trim(),
      revisionNumber: Math.max(1, Number(revisionNumber || 1)),
      rewriteInstructions: normalizedInstructions
    }
  };
}

function buildTemplateDraft(source, voice, fallbackReason = "") {
  const mainSentence = firstNonEmptySentence(source.text) || truncate(source.text, 220);
  const topic = deriveTopic(source.text);
  const authorLabel = source.authorName || source.authorHandle || "a post";
  const sourceLabel =
    source.type === "x-post" ? `from ${authorLabel} on X` : "from a post I was sent";
  const mediaNote = source.manualMediaNotes
    ? ` The attached visual seems to matter here: ${truncate(source.manualMediaNotes, 160)}`
    : source.media.length
      ? ` The source also includes ${buildMediaSummary(source.media).toLowerCase()}.`
      : "";
  const openingLine =
    source.type === "x-post"
      ? `I came across a post ${sourceLabel} that is worth unpacking.`
      : "I was sent a post that is worth unpacking.";
  const shortHook =
    voice === "founder"
      ? `My read: this is a strong signal on ${topic}, and it feels more operational than promotional.`
      : voice === "operator"
        ? `My read: this is a useful signal on ${topic}, and it is worth translating into an actual decision.`
        : `My read: this is a useful signal on ${topic}, and it is more relevant than the usual headline churn.`;
  const bodyParagraphs = [
    truncate(`${openingLine} The core takeaway ${sourceLabel} is straightforward: ${mainSentence}`, 280),
    truncate(
      `What stands out to me is the practical implication behind the update. It points to how teams can think about speed, cost, or adoption rather than treating it as just another headline.${mediaNote}`,
      300
    ),
    truncate(
      voice === "founder"
        ? "If this trend holds, it could reshape product roadmaps, deployment choices, and what feels possible at the application layer."
        : voice === "operator"
          ? "For operators, the useful question is not whether the post sounds exciting, but what it changes in deployment decisions, technical leverage, or go-to-market timing."
          : "For me, the useful lens is what this changes in execution, product strategy, or infrastructure planning.",
      300
    )
  ].filter(Boolean);

  const draft = {
    headline: truncate(`Why this ${topic} update matters`, 100),
    hook: truncate(shortHook, 210),
    bodyParagraphs,
    cta: truncate(
      voice === "operator"
        ? "Curious how others would translate this into an actual operating decision."
        : "Curious how others see this affecting product, engineering, or AI strategy.",
      170
    ),
    hashtags: buildKeywordHashtags(source.text),
    generation: {
      mode: "template",
      provider: "local",
      model: "",
      fallbackReason: fallbackReason || "Template generation was used."
    }
  };

  return {
    ...draft,
    fullPost: buildFullPost(draft)
  };
}

function buildTemplateRewrite(source, currentDraft, voice, instructions, fallbackReason = "") {
  const rewrittenDraft = buildTemplateDraft(
    source,
    voice,
    fallbackReason || "Template rewrite was used."
  );
  const normalizedInstructions = normalizeInstructions(instructions);

  if (/short|concise|tighter|120|180/.test(normalizedInstructions.toLowerCase())) {
    rewrittenDraft.bodyParagraphs = rewrittenDraft.bodyParagraphs.slice(0, 2);
  }

  if (/opinionated|stronger|bolder|spicier/.test(normalizedInstructions.toLowerCase())) {
    rewrittenDraft.hook = truncate(
      `My take: ${rewrittenDraft.hook.replace(/^My read:\s*/i, "").replace(/^I came across/i, "I came across")}`,
      210
    );
  }

  if (/question|feedback|discussion/.test(normalizedInstructions.toLowerCase())) {
    rewrittenDraft.cta = "Curious how others would challenge or build on this take.";
  }

  if (currentDraft?.headline && !rewrittenDraft.headline) {
    rewrittenDraft.headline = currentDraft.headline;
  }

  rewrittenDraft.generation = {
    ...rewrittenDraft.generation,
    fallbackReason:
      fallbackReason ||
      `Template rewrite used. Requested instructions: ${truncate(normalizedInstructions, 140)}`
  };
  rewrittenDraft.fullPost = buildFullPost(rewrittenDraft);
  return rewrittenDraft;
}

function buildModelPrompt(source, voice) {
  const sourceLines = [
    ...WRITER_CONTEXT,
    "",
    "Goal: write a LinkedIn post that helps the user build a thoughtful personal brand from a sourced insight.",
    `Voice: ${voice}`,
    `Voice guide: ${VOICE_GUIDES[voice]}`,
    `Source type: ${source.type}`,
    `Author: ${source.authorName || source.authorHandle || "Unknown"}`,
    `Created at: ${source.createdAt || "Unknown"}`,
    `Extraction method: ${source.extractionMethod || "manual"}`,
    `Media summary: ${source.manualMediaNotes || source.mediaSummary || "No media details"}`,
    `Source text:\n${source.text}`
  ];

  if (source.links.length) {
    sourceLines.push(
      `Referenced links:\n${source.links.map((item) => item.expandedUrl).join("\n")}`
    );
  }

  return sourceLines.join("\n\n");
}

function buildRewritePrompt({ source, currentDraft, voice, instructions }) {
  const promptSections = [
    ...WRITER_CONTEXT,
    "",
    "Goal: rewrite an existing LinkedIn draft so it better fits the user's personal brand while staying faithful to the source.",
    `Voice: ${voice}`,
    `Voice guide: ${VOICE_GUIDES[voice]}`,
    `Rewrite instructions: ${instructions}`,
    `Source author: ${source.authorName || source.authorHandle || "Unknown"}`,
    `Source type: ${source.type}`,
    `Source text:\n${source.text}`,
    `Current headline: ${currentDraft.headline || ""}`,
    `Current hook: ${currentDraft.hook || ""}`,
    `Current draft body:\n${currentDraft.fullPost || ""}`,
    "Write in first person as an independent creator reacting to something you came across.",
    "Do not impersonate or speak on behalf of the source account.",
    "Apply the rewrite instructions directly, not as meta commentary."
  ];

  if (source.links.length) {
    promptSections.push(`Source links:\n${source.links.map((item) => item.expandedUrl).join("\n")}`);
  }

  return promptSections.join("\n\n");
}

function polishDraftText(text, source) {
  let nextText = cleanText(text);
  const authorLabel = cleanText(source?.authorName || source?.authorHandle || "");
  const primaryUrl = cleanText(source?.links?.[0]?.expandedUrl || "");

  if (authorLabel) {
    const sawAuthorPattern = new RegExp(`\\bI saw ${escapeRegExp(authorLabel)} post\\b`, "gi");
    const sawAuthorPostPattern = new RegExp(`\\bI saw a post from ${escapeRegExp(authorLabel)}\\b`, "gi");
    nextText = nextText.replace(sawAuthorPattern, `I came across a post from ${authorLabel}`);
    nextText = nextText.replace(sawAuthorPostPattern, `I came across a post from ${authorLabel}`);
  }

  nextText = nextText.replace(/\((?:link|source)\)/gi, "");

  if (primaryUrl) {
    nextText = nextText.replace(
      /Read [^.:\n]+ blog(?: post)?[^:]*:\s*(https?:\/\/\S+)/i,
      `The fuller write-up is here: $1`
    );
  }

  return cleanText(nextText);
}

async function requestModelDraft(source, voice) {
  const config = resolveLlmConfig({
    modelEnvVar: "LINKEDIN_COMPOSER_MODEL",
    defaultModel: DEFAULT_MODEL
  });

  if (!canUseModel(config)) {
    return null;
  }

  const response = await requestStructuredResponse({
    config,
    instructions:
      "You write polished LinkedIn posts from source material. Write as the user in first person as an independent creator. The source is something the user read or saw, not something they authored. Keep it specific, practical, and brand-building. Avoid hype, avoid corporate-speak, and do not invent facts beyond the source text and provided media notes. Never imply the user is the original source account or affiliated with it. Use natural wording like 'I came across a post from...' instead of awkward phrasing like 'I saw Google Research post'. Make every paragraph a complete thought. Do not use placeholders like '(link)'. If a source URL is provided, mention it naturally or omit it.",
    inputText: buildModelPrompt(source, voice),
    schema: LINKEDIN_DRAFT_SCHEMA,
    schemaName: "linkedin_post_draft",
    emptyOutputMessage: "No LinkedIn draft payload was returned by the model.",
    requestErrorMessage: "LinkedIn draft generation failed."
  });
  const parsed = JSON.parse(response.outputText);
  const draft = {
    headline: cleanText(parsed.headline),
    hook: polishDraftText(parsed.hook, source),
    bodyParagraphs: Array.isArray(parsed.bodyParagraphs)
      ? parsed.bodyParagraphs.map((item) => polishDraftText(item, source)).filter(Boolean)
      : [],
    cta: polishDraftText(parsed.cta, source),
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((item) => normalizeHashtag(item)).filter(Boolean)
      : [],
    generation: {
      mode: "model",
      provider: config.provider,
      model: config.model
    }
  };

  return {
    ...draft,
    fullPost: buildFullPost(draft)
  };
}

async function requestModelRewrite({ source, currentDraft, voice, instructions }) {
  const config = resolveLlmConfig({
    modelEnvVar: "LINKEDIN_COMPOSER_MODEL",
    defaultModel: DEFAULT_MODEL
  });

  if (!canUseModel(config)) {
    return null;
  }

  const response = await requestStructuredResponse({
    config,
    instructions:
      "You rewrite LinkedIn posts for a personal brand. Write as the user in first person as an independent creator. The source is something the user saw or read, not something they authored. Apply the rewrite instructions precisely, keep the draft specific and practical, and never imply the user is the source account or affiliated with it. Avoid placeholders and make each paragraph a complete thought.",
    inputText: buildRewritePrompt({
      source,
      currentDraft,
      voice,
      instructions
    }),
    schema: LINKEDIN_DRAFT_SCHEMA,
    schemaName: "linkedin_post_rewrite",
    emptyOutputMessage: "No LinkedIn rewrite payload was returned by the model.",
    requestErrorMessage: "LinkedIn rewrite generation failed."
  });
  const parsed = JSON.parse(response.outputText);
  const draft = {
    headline: cleanText(parsed.headline),
    hook: polishDraftText(parsed.hook, source),
    bodyParagraphs: Array.isArray(parsed.bodyParagraphs)
      ? parsed.bodyParagraphs.map((item) => polishDraftText(item, source)).filter(Boolean)
      : [],
    cta: polishDraftText(parsed.cta, source),
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((item) => normalizeHashtag(item)).filter(Boolean)
      : [],
    generation: {
      mode: "model-rewrite",
      provider: config.provider,
      model: config.model
    }
  };

  return {
    ...draft,
    fullPost: buildFullPost(draft)
  };
}

export function getLinkedinComposerCapabilities() {
  const config = resolveLlmConfig({
    modelEnvVar: "LINKEDIN_COMPOSER_MODEL",
    defaultModel: DEFAULT_MODEL
  });

  return {
    publicXParsing: true,
    manualFallback: true,
    imagePreview: true,
    imageUnderstanding: false,
    generationMode: canUseModel(config) ? "model-with-template-fallback" : "template-only",
    provider: config.provider,
    model: config.model
  };
}

export function getLinkedinComposerTools() {
  return {
    rewritePresets: LINKEDIN_REWRITE_PRESETS,
    helperTools: LINKEDIN_HELPER_TOOLS
  };
}

export async function createLinkedinDraft({
  xUrl,
  manualText,
  manualAuthor,
  manualMediaNotes,
  voice,
  origin = "ui"
} = {}) {
  const normalizedVoice = normalizeVoice(voice);
  const trimmedXUrl = String(xUrl || "").trim();
  const trimmedManualText = cleanText(manualText);
  const warnings = [];

  if (!trimmedXUrl && !trimmedManualText) {
    const error = new Error("Paste an X post URL or manual post text first.");
    error.statusCode = 400;
    throw error;
  }

  let source = null;

  if (trimmedXUrl) {
    try {
      source = await resolveXPost(trimmedXUrl);
    } catch (error) {
      if (!trimmedManualText) {
        error.statusCode = error.statusCode || 400;
        throw error;
      }

      warnings.push(
        `Public X parsing did not succeed, so the manual text fallback was used instead. ${error.message}`
      );
    }
  }

  if (!source) {
    source = buildManualSource({
      manualText: trimmedManualText,
      manualAuthor,
      manualMediaNotes,
      xUrl: trimmedXUrl
    });
  } else if (manualMediaNotes) {
    source = {
      ...source,
      manualMediaNotes: cleanText(manualMediaNotes)
    };
  }

  let draft = null;

  try {
    draft = await requestModelDraft(source, normalizedVoice);
  } catch (error) {
    warnings.push(
      `Model generation was unavailable, so the template fallback was used instead. ${error.message}`
    );
  }

  if (!draft) {
    draft = buildTemplateDraft(source, normalizedVoice, warnings.at(-1) || "");
  }

  return persistLinkedinDraft(
    buildDraftRecord({
      source,
      draft,
      voice: normalizedVoice,
      origin,
      warnings
    })
  );
}

export async function rewriteLinkedinDraft({
  draftId,
  instructions,
  voice,
  origin = "ui-rewrite"
} = {}) {
  const existingDraft = getLinkedinDraft(draftId);
  const normalizedInstructions = normalizeInstructions(instructions);

  if (!existingDraft) {
    const error = new Error("LinkedIn draft not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!normalizedInstructions) {
    const error = new Error("Add rewrite instructions first.");
    error.statusCode = 400;
    throw error;
  }

  const normalizedVoice = normalizeVoice(voice || existingDraft.voice || DEFAULT_VOICE);
  const source = existingDraft.source || buildManualSource({ manualText: existingDraft?.draft?.fullPost || "" });
  const warnings = [];
  let rewrittenDraft = null;

  try {
    rewrittenDraft = await requestModelRewrite({
      source,
      currentDraft: existingDraft.draft || {},
      voice: normalizedVoice,
      instructions: normalizedInstructions
    });
  } catch (error) {
    warnings.push(
      `Model rewrite was unavailable, so the template rewrite fallback was used instead. ${error.message}`
    );
  }

  if (!rewrittenDraft) {
    rewrittenDraft = buildTemplateRewrite(
      source,
      existingDraft.draft || {},
      normalizedVoice,
      normalizedInstructions,
      warnings.at(-1) || ""
    );
  }

  return persistLinkedinDraft(
    buildDraftRecord({
      source,
      draft: rewrittenDraft,
      voice: normalizedVoice,
      origin,
      warnings,
      instructions: normalizedInstructions,
      parentDraftId: existingDraft.id,
      rootDraftId: existingDraft.library?.rootDraftId || existingDraft.id,
      revisionNumber: Number(existingDraft.library?.revisionNumber || 1) + 1
    })
  );
}
