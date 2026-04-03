import {
  describeBackgroundPipelineSchedule,
  getBackgroundPipelineStatus
} from "./backgroundPipelineRunner.js";
import { buildCurrentDecisionReviewState } from "./decisionReviewStore.js";
import { monitoredUniverse } from "./data.js";
import { readFinancialProfile } from "./financialProfileStore.js";
import { createLinkedinDraft } from "./linkedinComposer.js";
import { executePipelineJob, getOrchestratorStatus } from "./orchestrator.js";
import {
  callTelegramApi,
  getNotificationConfig,
  getNotificationStatus,
  sendTelegramTextMessage
} from "./notificationProvider.js";
import { getLatestPipelineSnapshot, getPipelineRun } from "./pipelineStore.js";
import { buildDailyDigest } from "./reportBuilder.js";
import { listResearchDossiers } from "./researchStore.js";
import { createSource, listSources } from "./sourceStore.js";
import { listPendingManualPosts } from "./manualPostProcessingStore.js";
import { importAttributedManualPosts } from "./tweetStore.js";
import { extractFirstXPostUrl, resolveXPost } from "./xPostResolver.js";
import { buildStoredPolymarketState } from "./polymarketDesk.js";

const TELEGRAM_BOT_COMMANDS = [
  {
    command: "start",
    description: "Show what X-Ticker does"
  },
  {
    command: "status",
    description: "Show latest pipeline status"
  },
  {
    command: "digest",
    description: "Send the latest operator digest"
  },
  {
    command: "actions",
    description: "Show aggregated actions for tracked holdings and watchlist names"
  },
  {
    command: "detailed_actions",
    description: "Show detailed actions for the full monitored asset space"
  },
  {
    command: "polymarket",
    description: "Show the latest Polymarket desk state"
  },
  {
    command: "ingest",
    description: "Import pasted posts into the manual feed"
  },
  {
    command: "process",
    description: "Process queued manual tweets"
  },
  {
    command: "linkedin",
    description: "Draft a LinkedIn post from an X link or pasted text"
  },
  {
    command: "help",
    description: "Show available commands"
  }
];

const DEFAULT_POLLING_TIMEOUT_SECONDS = 30;
const RETRY_DELAY_MS = 3000;
const TELEGRAM_IMPORT_DEFAULT_RELIABILITY = 0.62;
const TELEGRAM_TEXT_SOFT_LIMIT = 2800;

let pollLoopPromise = null;
let state = {
  active: false,
  running: false,
  startedAt: "",
  lastPollAt: "",
  lastUpdateId: 0,
  lastCommandAt: "",
  lastCommand: "",
  lastError: "",
  commandsSyncedAt: "",
  allowedChatId: ""
};

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeCommand(text) {
  const firstToken = String(text || "").trim().split(/\s+/)[0] || "";

  if (!firstToken.startsWith("/")) {
    return "";
  }

  return firstToken.slice(1).split("@")[0].toLowerCase();
}

function getCommandPayload(text) {
  const trimmedText = normalizeTelegramImportText(text).trim();
  const firstWhitespaceIndex = trimmedText.search(/\s/);

  if (firstWhitespaceIndex === -1) {
    return "";
  }

  return trimmedText.slice(firstWhitespaceIndex + 1).trim();
}

function normalizeTelegramImportText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
}

function truncateTelegramPreview(value, maxLength = 220) {
  const text = normalizeTelegramImportText(value).replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function splitLongTelegramSegment(segment, maxLength = TELEGRAM_TEXT_SOFT_LIMIT) {
  const normalizedSegment = normalizeTelegramImportText(segment).trim();

  if (!normalizedSegment) {
    return [];
  }

  if (normalizedSegment.length <= maxLength) {
    return [normalizedSegment];
  }

  const sentences =
    normalizedSegment.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) || [
      normalizedSegment
    ];
  const chunks = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const candidate = currentChunk ? `${currentChunk} ${sentence}` : sentence;

    if (candidate.length <= maxLength) {
      currentChunk = candidate;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    if (sentence.length <= maxLength) {
      currentChunk = sentence;
      continue;
    }

    for (let index = 0; index < sentence.length; index += maxLength) {
      chunks.push(sentence.slice(index, index + maxLength).trim());
    }

    currentChunk = "";
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.filter(Boolean);
}

function splitTelegramText(value, maxLength = TELEGRAM_TEXT_SOFT_LIMIT) {
  const paragraphs = normalizeTelegramImportText(value)
    .split(/\n\s*\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => splitLongTelegramSegment(item, maxLength));
  const chunks = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    const candidate = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxLength) {
      currentChunk = candidate;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    currentChunk = paragraph;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.filter(Boolean);
}

function parseTelegramImportHeader(line) {
  let workingLine = normalizeTelegramImportText(line).trim();
  let createdAt = "";
  const timestampSeparatorIndex = workingLine.indexOf("|");

  if (timestampSeparatorIndex > 0) {
    const timestampCandidate = workingLine.slice(0, timestampSeparatorIndex).trim();
    const parsedTimestamp = new Date(timestampCandidate);

    if (!Number.isNaN(parsedTimestamp.getTime())) {
      createdAt = parsedTimestamp.toISOString();
      workingLine = workingLine.slice(timestampSeparatorIndex + 1).trim();
    }
  }

  const match = /^(@[A-Za-z0-9_][A-Za-z0-9_.-]*)(?:\s*[:|-]\s*|\s+)?(.*)$/.exec(workingLine);

  if (!match) {
    throw new Error(
      "Each imported block must start with @handle followed by a colon or line break."
    );
  }

  return {
    handle: match[1],
    createdAt,
    inlineBody: String(match[2] || "").trim()
  };
}

function looksLikeTelegramImportHeader(line) {
  try {
    return Boolean(parseTelegramImportHeader(line).handle);
  } catch (_error) {
    return false;
  }
}

function parseTelegramImportBlock(block) {
  const rawLines = normalizeTelegramImportText(block).split("\n");
  const lines = [...rawLines];

  while (lines.length && !String(lines[0] || "").trim()) {
    lines.shift();
  }

  while (lines.length && !String(lines.at(-1) || "").trim()) {
    lines.pop();
  }

  if (!lines.length) {
    throw new Error("Each imported post needs a handle and body text.");
  }

  const header = parseTelegramImportHeader(lines[0]);
  const body = [header.inlineBody, ...lines.slice(1)].join("\n").trim();

  if (!body) {
    throw new Error(`No post body was found for ${header.handle}.`);
  }

  return {
    type: "manual",
    handle: header.handle,
    createdAt: header.createdAt,
    body
  };
}

function isExactXPostUrlBlock(block) {
  const normalizedBlock = normalizeTelegramImportText(block).trim();
  const detectedUrl = extractFirstXPostUrl(normalizedBlock);
  return Boolean(detectedUrl && detectedUrl === normalizedBlock);
}

function parseTelegramImportUrlBlock(block) {
  const normalizedBlock = normalizeTelegramImportText(block).trim();
  const xUrl = extractFirstXPostUrl(normalizedBlock);

  if (!xUrl || xUrl !== normalizedBlock) {
    throw new Error("Each URL import block must contain exactly one public X post URL.");
  }

  return {
    type: "x-url",
    xUrl
  };
}

function parseTelegramImportRequest(text) {
  const commandPayload = getCommandPayload(text);

  if (!commandPayload || /^help\b/i.test(commandPayload)) {
    return {
      showHelp: true,
      replaceExisting: false,
      posts: []
    };
  }

  let replaceExisting = false;
  let rawPosts = commandPayload;
  const modeMatch = /^(append|replace)\b/i.exec(commandPayload);

  if (modeMatch) {
    replaceExisting = modeMatch[1].toLowerCase() === "replace";
    rawPosts = commandPayload.slice(modeMatch[0].length).trim();
  }

  const normalizedRawPosts = normalizeTelegramImportText(rawPosts).trim();

  if (!normalizedRawPosts) {
    throw new Error(
      "Paste at least one post after /ingest. Use /ingest help to see the expected format."
    );
  }

  if (isExactXPostUrlBlock(normalizedRawPosts)) {
    return {
      showHelp: false,
      replaceExisting,
      posts: [parseTelegramImportUrlBlock(normalizedRawPosts)]
    };
  }

  const separatedBlocks = normalizedRawPosts
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!separatedBlocks.length) {
    throw new Error(
      "Paste at least one post after /ingest. Use /ingest help to see the expected format."
    );
  }

  return {
    showHelp: false,
    replaceExisting,
    posts: separatedBlocks.map((block) =>
      isExactXPostUrlBlock(block) ? parseTelegramImportUrlBlock(block) : parseTelegramImportBlock(block)
    )
  };
}

function buildTelegramImportSource(handle) {
  const normalizedHandle = String(handle || "").trim();

  return {
    handle: normalizedHandle,
    name: normalizedHandle.replace(/^@/, "") || normalizedHandle,
    category: "Telegram / Manual Import",
    baselineReliability: TELEGRAM_IMPORT_DEFAULT_RELIABILITY,
    preferredHorizon: "0-3 days",
    policyTemplate: "Imported manually through the Telegram inbox instead of synced from the X API.",
    relevantSectors: [],
    allowedAssets: monitoredUniverse.map((asset) => asset.ticker),
    specialHandling:
      "Treat as manually pasted third-party content. Require corroboration before high-conviction upgrades.",
    tone: "Direct"
  };
}

function resolveTelegramImportSource(handle, sourcesByHandle, sourceFactory = buildTelegramImportSource) {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  const existingSource = sourcesByHandle.get(normalizedHandle);

  if (existingSource) {
    return {
      source: existingSource,
      created: false
    };
  }

  const createdSource = createSource(sourceFactory(handle));
  sourcesByHandle.set(normalizedHandle, createdSource);

  return {
    source: createdSource,
    created: true
  };
}

function buildIngestHelpMessage() {
  return {
    title: "Telegram ingest",
    summary: "Use /ingest to append or replace the manual queue with either public X post URLs or pasted posts.",
    highlights: [
      "/ingest https://x.com/googleresearch/status/2036533564158910740",
      "/ingest append",
      "@semiflow: Broadening risk appetite keeps semis bid; still constructive on NVDA.",
      "2026-03-24T11:45:00Z | @btcwatch: BTC positioning still looks louder than spot demand.",
      "Separate multiple URL imports or pasted posts with a blank line.",
      "Use /process to analyse the queued tweets."
    ],
    footer:
      "The scheduler can stay off when you use Telegram as the manual signal inbox."
  };
}

function buildTelegramImportedSource(handle) {
  const normalizedHandle = String(handle || "").trim();

  return {
    handle: normalizedHandle,
    name: normalizedHandle.replace(/^@/, "") || normalizedHandle,
    category: "Telegram / X URL Import",
    baselineReliability: TELEGRAM_IMPORT_DEFAULT_RELIABILITY,
    preferredHorizon: "0-3 days",
    policyTemplate:
      "Imported through the Telegram inbox from a public X post URL instead of the paid X API.",
    relevantSectors: [],
    allowedAssets: monitoredUniverse.map((asset) => asset.ticker),
    specialHandling:
      "Treat as third-party public X content. Calibrate trust at the source level and still require corroboration before high-conviction upgrades.",
    tone: "Direct"
  };
}

async function importPostsFromTelegramMessage(messageText) {
  const request = parseTelegramImportRequest(messageText);

  if (request.showHelp) {
    return {
      helpMessage: buildIngestHelpMessage()
    };
  }

  const sourcesByHandle = new Map(
    listSources().map((source) => [String(source.handle || "").toLowerCase(), source])
  );
  const sourceIds = new Set();
  let createdSourceCount = 0;
  const attributedPosts = [];

  for (const post of request.posts) {
    if (post.type === "x-url") {
      const resolvedPost = await resolveXPost(post.xUrl);
      const authorHandle = String(resolvedPost.authorHandle || "").trim();

      if (!authorHandle) {
        throw new Error(
          `The imported X post ${post.xUrl} did not expose a usable author handle.`
        );
      }

      const resolvedSource = resolveTelegramImportSource(
        authorHandle,
        sourcesByHandle,
        buildTelegramImportedSource
      );

      if (resolvedSource.created) {
        createdSourceCount += 1;
      }

      sourceIds.add(resolvedSource.source.id);
      attributedPosts.push({
        sourceId: resolvedSource.source.id,
        createdAt: resolvedPost.createdAt,
        body: resolvedPost.text,
        xUrl: resolvedPost.xUrl,
        canonicalUrl: resolvedPost.canonicalUrl,
        authorHandle: resolvedPost.authorHandle,
        authorName: resolvedPost.authorName,
        importMethod: `telegram-url:${resolvedPost.extractionMethod || "public-x"}`,
        actionable: false,
        claimType: "Operator commentary",
        direction: "Mixed",
        explicitness: "Explicit",
        themes: [],
        confidence: Number(
          resolvedSource.source?.baselineReliability || TELEGRAM_IMPORT_DEFAULT_RELIABILITY
        ),
        mappedAssets: [],
        clusterId: "cluster-enterprise-ai"
      });
      continue;
    }

    const resolved = resolveTelegramImportSource(post.handle, sourcesByHandle);

    if (resolved.created) {
      createdSourceCount += 1;
    }

    sourceIds.add(resolved.source.id);

    attributedPosts.push({
      sourceId: resolved.source.id,
      createdAt: post.createdAt,
      body: post.body,
      authorHandle: post.handle,
      importMethod: "telegram-manual",
      actionable: false,
      claimType: "Operator commentary",
      direction: "Mixed",
      explicitness: "Explicit",
      themes: [],
      confidence: Number(
        resolved.source?.baselineReliability || TELEGRAM_IMPORT_DEFAULT_RELIABILITY
      ),
      mappedAssets: [],
      clusterId: "cluster-enterprise-ai"
    });
  }

  const store = importAttributedManualPosts({
    posts: attributedPosts,
    replaceExisting: request.replaceExisting
  });
  const pendingState = listPendingManualPosts();

  return {
    helpMessage: null,
    importedCount: attributedPosts.length,
    sourceCount: sourceIds.size,
    createdSourceCount,
    replaceExisting: request.replaceExisting,
    feedMode: store.mode,
    eligibleCount: pendingState.eligibleCount,
    pendingCount: pendingState.pendingCount
  };
}

async function processPendingManualPostsFromTelegram() {
  const pendingState = listPendingManualPosts();

  if (!pendingState.manualModeActive) {
    return {
      processed: false,
      summary: "Manual feed mode is not active.",
      pendingState
    };
  }

  if (!pendingState.eligibleCount) {
    return {
      processed: false,
      summary: `No queued manual tweets younger than ${pendingState.maxPostAgeHours} hours were found.`,
      pendingState
    };
  }

  if (!pendingState.pendingCount) {
    return {
      processed: false,
      summary: "All queued manual tweets in the active 24-hour window are already processed.",
      pendingState
    };
  }

  const pipelineResult = await executePipelineJob({
    trigger: "telegram-manual-process",
    reason: `${pendingState.pendingCount} queued manual tweet(s)`,
    meta: {
      pendingManualPostCount: pendingState.pendingCount,
      eligibleManualPostCount: pendingState.eligibleCount,
      maxPostAgeHours: pendingState.maxPostAgeHours
    }
  });

  return {
    processed: true,
    summary: `Processed ${pendingState.pendingCount} queued manual tweet(s).`,
    pendingState,
    pipelineJobId: pipelineResult.jobId,
    pipelineRunId: pipelineResult.run.id
  };
}

function buildIngestSuccessMessage(result) {
  return {
    title: "Manual queue updated",
    summary:
      result.importedCount === 1
        ? result.replaceExisting
          ? "Tweet replaced the current manual queue successfully."
          : "Tweet appended successfully."
        : result.replaceExisting
          ? `Replaced the manual queue with ${result.importedCount} imported post(s).`
          : `Appended ${result.importedCount} imported post(s) to the manual queue.`,
    facts: [
      {
        label: "Sources touched",
        value: String(result.sourceCount)
      },
      {
        label: "New sources",
        value: String(result.createdSourceCount)
      },
      {
        label: "Imported posts",
        value: String(result.importedCount)
      },
      {
        label: "Feed mode",
        value: result.feedMode
      },
      {
        label: "Queued <=24h",
        value: String(result.pendingCount)
      }
    ],
    footer: "Use /process to analyse queued tweets now, or wait for the 6-hour cron."
  };
}

function buildProcessResultMessage(result) {
  if (!result.processed) {
    return {
      title: "Manual queue idle",
      summary: result.summary,
      facts: [
        {
          label: "Eligible <=24h",
          value: String(result.pendingState?.eligibleCount || 0)
        },
        {
          label: "Queued",
          value: String(result.pendingState?.pendingCount || 0)
        }
      ],
      footer: "Use /ingest append to add more tweets to the queue."
    };
  }

  return {
    title: "Manual queue processed",
    summary: result.summary,
    facts: [
      {
        label: "Eligible <=24h",
        value: String(result.pendingState.eligibleCount)
      },
      {
        label: "Processed now",
        value: String(result.pendingState.pendingCount)
      },
      {
        label: "Pipeline run",
        value: result.pipelineRunId
      }
    ],
    footer: `Pipeline job ${result.pipelineJobId} finished successfully.`
  };
}

function getTelegramBotRunnerConfig() {
  const notificationConfig = getNotificationConfig();
  const commandsEnabled = process.env.TELEGRAM_COMMANDS_ENABLED === "1";
  const allowedChatId = String(
    process.env.TELEGRAM_ALLOWED_CHAT_ID || notificationConfig.telegramChatId || ""
  ).trim();
  const pollingTimeoutSeconds = Number(
    process.env.TELEGRAM_POLLING_TIMEOUT_SECONDS || DEFAULT_POLLING_TIMEOUT_SECONDS
  );

  return {
    ...notificationConfig,
    commandsEnabled,
    allowedChatId,
    pollingTimeoutSeconds:
      Number.isFinite(pollingTimeoutSeconds) && pollingTimeoutSeconds > 0
        ? Math.min(Math.round(pollingTimeoutSeconds), 60)
        : DEFAULT_POLLING_TIMEOUT_SECONDS
  };
}

function canRunTelegramBot(config = getTelegramBotRunnerConfig()) {
  return Boolean(config.commandsEnabled && config.telegramBotToken && config.allowedChatId);
}

function describeScheduler(scheduler) {
  if (!scheduler?.active) {
    return "Paused";
  }

  if (scheduler.running) {
    return `Running now · ${describeBackgroundPipelineSchedule(scheduler)}`;
  }

  return `Active · ${describeBackgroundPipelineSchedule(scheduler)}`;
}

function buildHelpMessage() {
  return {
    title: "X-Ticker commands",
    summary: "Use the bot as a lightweight operator console for the local research desk.",
    highlights: [
      ...TELEGRAM_BOT_COMMANDS.map((item) => `/${item.command} · ${item.description}`),
      "You can also send a raw public X post URL to create a LinkedIn draft."
    ],
    footer:
      "Commands are limited to the configured operator chat while the local server is running. Use /ingest help for the queue format."
  };
}

function buildLinkedinHelpMessage() {
  return {
    title: "LinkedIn draft flow",
    summary:
      "Send a public X post URL to the bot, or use /linkedin with either an X URL or manually pasted text.",
    highlights: [
      "/linkedin https://x.com/googleresearch/status/2036533564158910740",
      "/linkedin Paste the post text here if public X parsing does not work.",
      "You can also send the raw X post URL without a command.",
      "Media previews are captured when X exposes them publicly."
    ],
    footer:
      "This flow avoids the paid X API. Review the latest result in the local page at /linkedin-composer.html."
  };
}

function buildLinkedinDraftMessage(draft) {
  const sourceLabel =
    draft?.source?.authorHandle || draft?.source?.authorName || (draft?.source?.type === "manual" ? "Manual paste" : "Unknown source");
  const generationLabel =
    draft?.draft?.generation?.mode === "model"
      ? `${draft.draft.generation.model || "Model"}`
      : "Template fallback";

  return {
    title: "LinkedIn draft ready",
    summary:
      draft?.source?.type === "x-post"
        ? `Built from a post by ${sourceLabel} using public X parsing.`
        : "Built from manually pasted source text.",
    facts: [
      {
        label: "Voice",
        value: String(draft?.voice || "professional")
      },
      {
        label: "Media",
        value: String(draft?.source?.manualMediaNotes ? "Manual media notes" : draft?.source?.mediaSummary || "None")
      },
      {
        label: "Generation",
        value: generationLabel
      }
    ],
    highlights: [
      truncateTelegramPreview(draft?.draft?.headline || ""),
      truncateTelegramPreview(draft?.draft?.hook || ""),
      truncateTelegramPreview(draft?.draft?.fullPost || "", 280)
    ].filter(Boolean),
    footer: "Open /linkedin-composer.html locally to review and copy the latest draft."
  };
}

function buildLinkedinErrorMessage(error) {
  return {
    title: "LinkedIn draft failed",
    summary:
      error instanceof Error
        ? error.message
        : "The bot could not build a LinkedIn draft from that message.",
    footer:
      "If the X post is unavailable publicly, use /linkedin and paste the post text manually."
  };
}

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function normalizeResearchStatus(value) {
  return String(value || "discovery")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
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

function buildDecisionPriorityScore(action) {
  const actionPriority = {
    SELL: 3,
    BUY: 2,
    HOLD: 1
  };

  return actionPriority[String(action || "").trim().toUpperCase()] || 0;
}

function sortActionEntries(entries = []) {
  return [...entries].sort((left, right) => {
    const actionDifference = buildDecisionPriorityScore(right.action) - buildDecisionPriorityScore(left.action);

    if (actionDifference !== 0) {
      return actionDifference;
    }

    return Number(right.confidence || 0) - Number(left.confidence || 0);
  });
}

function buildResearchLookup() {
  const researchByAsset = new Map();

  for (const dossier of listResearchDossiers()) {
    for (const asset of dossier?.assets || []) {
      const cleanTicker = normalizeTicker(asset);

      if (cleanTicker && !researchByAsset.has(cleanTicker)) {
        researchByAsset.set(cleanTicker, dossier);
      }
    }
  }

  return researchByAsset;
}

function buildReviewLookup(reviewState) {
  return new Map(
    (reviewState?.current || [])
      .map((item) => [normalizeTicker(item.asset), item])
      .filter(([ticker]) => ticker)
  );
}

function formatStatusLabel(value, fallbackValue = "Pending") {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return fallbackValue;
  }

  return normalizedValue
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatConfidence(confidence) {
  return `${Math.round((Number(confidence) || 0) * 100)}%`;
}

function buildActionMixSummary(entries = []) {
  const counts = entries.reduce(
    (accumulator, entry) => {
      const action = String(entry.action || "").trim().toUpperCase();

      if (action === "BUY" || action === "HOLD" || action === "SELL") {
        accumulator[action] += 1;
      }

      return accumulator;
    },
    {
      BUY: 0,
      HOLD: 0,
      SELL: 0
    }
  );

  return `${counts.SELL} SELL, ${counts.BUY} BUY, ${counts.HOLD} HOLD`;
}

function buildActionHighlight(entry, { detailed = false } = {}) {
  if (!entry.covered || !entry.action) {
    return `${entry.ticker} · No live monitored recommendation right now.`;
  }

  const parts = [
    `${entry.ticker} ${entry.action}`,
    formatConfidence(entry.confidence),
    entry.reviewStatus ? `${formatStatusLabel(entry.reviewStatus)} review` : "No review",
    entry.researchStatus ? `${formatStatusLabel(entry.researchStatus)} research` : "No dossier"
  ];

  if (detailed && entry.tracked) {
    parts.push("Tracked");
  }

  if (entry.horizon) {
    parts.push(entry.horizon);
  }

  if (detailed && entry.summary) {
    parts.push(truncateTelegramPreview(entry.summary, 140));
  }

  return parts.join(" · ");
}

function buildPortfolioActionEntries({ latestSnapshot, financialProfile, reviewState }) {
  const trackedTickers = getTrackedTickers(financialProfile);
  const decisionByAsset = new Map(
    (latestSnapshot?.appData?.decisions || [])
      .map((decision) => [normalizeTicker(decision.asset), decision])
      .filter(([ticker]) => ticker)
  );
  const reviewByAsset = buildReviewLookup(reviewState);
  const researchByAsset = buildResearchLookup();
  const holdingsSet = new Set(
    (financialProfile.holdings || []).map((holding) => normalizeTicker(holding.ticker)).filter(Boolean)
  );
  const watchlistSet = new Set((financialProfile.watchlist || []).map((ticker) => normalizeTicker(ticker)).filter(Boolean));
  const coveredUniverse = new Set(monitoredUniverse.map((asset) => normalizeTicker(asset.ticker)));

  return sortActionEntries(
    trackedTickers.map((ticker) => {
      const decision = decisionByAsset.get(ticker) || null;
      const review = reviewByAsset.get(ticker) || null;
      const research = researchByAsset.get(ticker) || null;

      return {
        ticker,
        holding: holdingsSet.has(ticker),
        watchlist: watchlistSet.has(ticker),
        covered: Boolean(coveredUniverse.has(ticker) || decision),
        action: String(decision?.action || "").trim().toUpperCase(),
        confidence: Number(decision?.confidence || 0),
        horizon: String(decision?.horizon || "").trim(),
        summary: String(decision?.decisionMathSummary || decision?.rationale?.[0] || "").trim(),
        reviewStatus: String(review?.reviewStatus || "").trim().toLowerCase(),
        researchStatus: normalizeResearchStatus(research?.status || "")
      };
    })
  );
}

function buildDetailedActionEntries({ latestSnapshot, financialProfile, reviewState }) {
  const reviewByAsset = buildReviewLookup(reviewState);
  const researchByAsset = buildResearchLookup();
  const trackedTickers = new Set(getTrackedTickers(financialProfile));

  return sortActionEntries(
    (latestSnapshot?.appData?.decisions || []).map((decision) => {
      const ticker = normalizeTicker(decision.asset);
      const review = reviewByAsset.get(ticker) || null;
      const research = researchByAsset.get(ticker) || null;

      return {
        ticker,
        tracked: trackedTickers.has(ticker),
        covered: true,
        action: String(decision?.action || "").trim().toUpperCase(),
        confidence: Number(decision?.confidence || 0),
        horizon: String(decision?.horizon || "").trim(),
        summary: String(decision?.decisionMathSummary || decision?.rationale?.[0] || "").trim(),
        reviewStatus: String(review?.reviewStatus || "").trim().toLowerCase(),
        researchStatus: normalizeResearchStatus(research?.status || "")
      };
    })
  );
}

function buildActionsMessage() {
  const latestSnapshot = getLatestPipelineSnapshot();
  const financialProfile = readFinancialProfile();

  if (!latestSnapshot) {
    return {
      title: "Portfolio actions",
      summary: "No pipeline snapshot is available yet.",
      footer: "Run the pipeline first, then try /actions again."
    };
  }

  const trackedTickers = getTrackedTickers(financialProfile);

  if (!trackedTickers.length) {
    return {
      title: "Portfolio actions",
      summary: "No holdings or watchlist names are saved yet.",
      footer: "Add holdings or a watchlist in Portfolio, then try /actions again."
    };
  }

  const reviewState = buildCurrentDecisionReviewState({
    snapshot: latestSnapshot,
    financialProfile
  });
  const entries = buildPortfolioActionEntries({
    latestSnapshot,
    financialProfile,
    reviewState
  });
  const liveEntries = entries.filter((entry) => entry.covered && entry.action);
  const uncoveredEntries = entries.filter((entry) => !entry.covered || !entry.action);

  return {
    title: "Portfolio actions",
    summary: liveEntries.length
      ? `${liveEntries.length} of ${trackedTickers.length} tracked name(s) have live monitored calls: ${buildActionMixSummary(liveEntries)}.`
      : "No live monitored call exists yet for your current holdings or watchlist.",
    facts: [
      {
        label: "Tracked tickers",
        value: trackedTickers.join(", ")
      },
      {
        label: "Live calls",
        value: String(liveEntries.length)
      },
      {
        label: "Outside coverage",
        value: String(uncoveredEntries.length)
      },
      {
        label: "Pending approvals",
        value: String(reviewState.summary.proposedCount || 0)
      }
    ],
    highlights: [
      ...liveEntries.slice(0, 8).map((entry) => buildActionHighlight(entry)),
      ...uncoveredEntries.slice(0, 4).map((entry) => buildActionHighlight(entry))
    ],
    footer: "Use /detailed_actions for the full monitored asset space."
  };
}

function buildDetailedActionsMessage() {
  const latestSnapshot = getLatestPipelineSnapshot();
  const financialProfile = readFinancialProfile();

  if (!latestSnapshot) {
    return {
      title: "Detailed actions",
      summary: "No pipeline snapshot is available yet.",
      footer: "Run the pipeline first, then try /detailed_actions again."
    };
  }

  const reviewState = buildCurrentDecisionReviewState({
    snapshot: latestSnapshot,
    financialProfile
  });
  const entries = buildDetailedActionEntries({
    latestSnapshot,
    financialProfile,
    reviewState
  });

  return {
    title: "Detailed actions",
    summary: entries.length
      ? `${entries.length} monitored asset decision(s): ${buildActionMixSummary(entries)}.`
      : "No monitored asset decisions are available in the latest snapshot.",
    facts: [
      {
        label: "Snapshot",
        value: latestSnapshot.generatedAt || "Pending"
      },
      {
        label: "Pending approvals",
        value: String(reviewState.summary.proposedCount || 0)
      },
      {
        label: "Reviewed calls",
        value: String(reviewState.summary.reviewedCount || 0)
      }
    ],
    highlights: entries.slice(0, 16).map((entry) => buildActionHighlight(entry, { detailed: true })),
    footer: "Tracked names are tagged when they already exist in your saved holdings or watchlist."
  };
}

async function createLinkedinDraftFromTelegramMessage(messageText, origin) {
  const normalizedText = normalizeTelegramImportText(messageText).trim();
  const xUrl = extractFirstXPostUrl(normalizedText);

  return createLinkedinDraft({
    xUrl,
    manualText: xUrl ? "" : normalizedText,
    origin
  });
}

function buildStatusMessage() {
  const latestSnapshot = getLatestPipelineSnapshot();
  const latestRun = latestSnapshot?.runId ? getPipelineRun(latestSnapshot.runId) : null;
  const financialProfile = readFinancialProfile();
  const reviewState = latestSnapshot
    ? buildCurrentDecisionReviewState({
        snapshot: latestSnapshot,
        financialProfile
      })
    : {
        summary: {
          proposedCount: 0,
          reviewedCount: 0
        },
        queue: []
      };
  const topPendingReview = reviewState.queue.find((item) => item.reviewStatus === "proposed") || null;
  const topDecision = latestSnapshot?.appData?.decisions?.[0] || null;
  const scheduler = getBackgroundPipelineStatus();
  const notificationStatus = getNotificationStatus();

  return {
    title: "X-Ticker status",
    summary:
      topPendingReview
        ? `${topPendingReview.asset} is waiting in the approval queue as ${topPendingReview.action}.`
        : topDecision
          ? `${topDecision.asset} is the latest visible call at ${Math.round((topDecision.confidence || 0) * 100)}% confidence.`
          : latestRun
            ? `Latest run ${latestRun.id} completed without a visible tracked call.`
            : "No pipeline run is available yet.",
    facts: [
      {
        label: "Latest run",
        value: latestRun?.id || latestSnapshot?.runId || "Pending"
      },
      {
        label: "Snapshot",
        value: latestSnapshot?.generatedAt || "Pending"
      },
      {
        label: "Scheduler",
        value: describeScheduler(scheduler)
      },
      {
        label: "Pending approvals",
        value: String(reviewState.summary.proposedCount || 0)
      },
      {
        label: "Reviewed calls",
        value: String(reviewState.summary.reviewedCount || 0)
      },
      {
        label: "Notifications",
        value: notificationStatus.config.activeProvider
      }
    ],
    highlights: topPendingReview
      ? [
          `${topPendingReview.asset} ${topPendingReview.action} · ${Math.round((topPendingReview.confidence || 0) * 100)}% · ${topPendingReview.reviewStatus}`
        ]
      : topDecision
        ? [
            `${topDecision.asset} ${topDecision.action} · ${Math.round((topDecision.confidence || 0) * 100)}% · ${topDecision.rationale?.[0] || "No rationale captured."}`
          ]
        : ["Use /digest for the fuller operator summary."],
    footer: "Use /help to see the available bot commands."
  };
}

function buildDigestMessage() {
  const latestSnapshot = getLatestPipelineSnapshot();
  const latestRun = latestSnapshot?.runId ? getPipelineRun(latestSnapshot.runId) : null;
  const orchestratorStatus = getOrchestratorStatus();
  const financialProfile = readFinancialProfile();

  return buildDailyDigest({
    latestSnapshot,
    latestRun,
    runtimeJobs: orchestratorStatus.jobs || [],
    notificationStatus: orchestratorStatus.notifications || getNotificationStatus(),
    financialProfile
  });
}

function buildPolymarketMessage() {
  const polymarket = buildStoredPolymarketState();
  const latestAnalysis = polymarket.recentAnalyses[0] || null;
  const latestOrder = polymarket.recentOrders[0] || null;

  return {
    title: "Polymarket desk",
    summary: latestAnalysis
      ? `${latestAnalysis.question} -> ${latestAnalysis.decision} ${latestAnalysis.selectedOutcome}.`
      : "No Polymarket analyses are recorded yet.",
    facts: [
      {
        label: "Analyses",
        value: String(polymarket.summary.analysisCount || 0)
      },
      {
        label: "Buy-ready",
        value: String(polymarket.summary.buyReadyCount || 0)
      },
      {
        label: "Orders",
        value: String(polymarket.summary.orderCount || 0)
      },
      {
        label: "Submitted",
        value: String(polymarket.summary.submittedCount || 0)
      }
    ],
    highlights: latestAnalysis
      ? [
          `${latestAnalysis.selectedOutcome} · ${Math.round((latestAnalysis.marketImpliedProbability || 0) * 100)}% market · ${Math.round((latestAnalysis.estimatedProbability || 0) * 100)}% estimate`,
          ...(latestAnalysis.rationale || []).slice(0, 2)
        ]
      : ["Run the Polymarket tab analysis flow to populate the desk."],
    footer: latestOrder
      ? `Latest order: ${latestOrder.status}${latestOrder.providerOrderId ? ` · ${latestOrder.providerOrderId}` : ""}`
      : "Telegram push alerts also fire for new analyses and order attempts."
  };
}

async function sendCommandReply(chatId, message) {
  return sendTelegramTextMessage({
    chatId,
    message,
    config: getTelegramBotRunnerConfig()
  });
}

async function sendLinkedinDraftReply(chatId, draft) {
  await sendCommandReply(chatId, buildLinkedinDraftMessage(draft));

  const fullPost = normalizeTelegramImportText(draft?.draft?.fullPost || "").trim();

  if (!fullPost) {
    return;
  }

  const chunks = splitTelegramText(fullPost);

  for (const [index, chunk] of chunks.entries()) {
    const title =
      chunks.length > 1 ? `LinkedIn Post Text ${index + 1}/${chunks.length}` : "LinkedIn Post Text";

    await sendCommandReply(chatId, {
      title,
      summary: chunk,
      footer:
        index === chunks.length - 1
          ? "The same draft is also saved in /linkedin-composer.html."
          : ""
    });
  }
}

async function ensureAllowedChat(chatId) {
  if (!chatId) {
    return false;
  }

  if (chatId === state.allowedChatId) {
    return true;
  }

  await sendCommandReply(chatId, {
    title: "X-Ticker access restricted",
    summary: "This bot is currently limited to its configured operator chat.",
    footer: "Update TELEGRAM_ALLOWED_CHAT_ID if you want to move it to a different chat."
  });

  return false;
}

async function syncTelegramCommands(config = getTelegramBotRunnerConfig()) {
  await callTelegramApi(
    "setMyCommands",
    {
      commands: TELEGRAM_BOT_COMMANDS
    },
    config
  );

  state.commandsSyncedAt = new Date().toISOString();
}

async function handleTelegramCommand(command, message) {
  const chatId = String(message?.chat?.id || "").trim();

  if (!(await ensureAllowedChat(chatId))) {
    return;
  }

  if (command === "start" || command === "help") {
    await sendCommandReply(chatId, buildHelpMessage());
    return;
  }

  if (command === "status") {
    await sendCommandReply(chatId, buildStatusMessage());
    return;
  }

  if (command === "digest") {
    await sendCommandReply(chatId, buildDigestMessage());
    return;
  }

  if (command === "actions") {
    await sendCommandReply(chatId, buildActionsMessage());
    return;
  }

  if (command === "detailed_actions") {
    await sendCommandReply(chatId, buildDetailedActionsMessage());
    return;
  }

  if (command === "polymarket") {
    await sendCommandReply(chatId, buildPolymarketMessage());
    return;
  }

  if (command === "ingest") {
    try {
      const importResult = await importPostsFromTelegramMessage(String(message?.text || ""));

      if (importResult.helpMessage) {
        await sendCommandReply(chatId, importResult.helpMessage);
        return;
      }

      await sendCommandReply(chatId, buildIngestSuccessMessage(importResult));
    } catch (error) {
      await sendCommandReply(chatId, {
        title: "Telegram ingest failed",
        summary: error instanceof Error ? error.message : "The Telegram import could not be processed.",
        footer: "Use /ingest help to see the supported message format."
      });
    }

    return;
  }

  if (command === "process") {
    try {
      const processResult = await processPendingManualPostsFromTelegram();
      await sendCommandReply(chatId, buildProcessResultMessage(processResult));
    } catch (error) {
      await sendCommandReply(chatId, {
        title: "Manual queue process failed",
        summary: error instanceof Error ? error.message : "The queued manual tweets could not be processed.",
        footer: "Try again in a moment if another pipeline job was already running."
      });
    }

    return;
  }

  if (command === "linkedin") {
    const commandPayload = getCommandPayload(String(message?.text || ""));

    if (!commandPayload || /^help\b/i.test(commandPayload)) {
      await sendCommandReply(chatId, buildLinkedinHelpMessage());
      return;
    }

    try {
      const draft = await createLinkedinDraftFromTelegramMessage(commandPayload, "telegram-command");
      await sendLinkedinDraftReply(chatId, draft);
    } catch (error) {
      await sendCommandReply(chatId, buildLinkedinErrorMessage(error));
    }

    return;
  }

  await sendCommandReply(chatId, {
    title: "Unknown command",
    summary: `/${command} is not configured yet.`,
    highlights: TELEGRAM_BOT_COMMANDS.map((item) => `/${item.command} · ${item.description}`)
  });
}

async function handleTelegramUpdate(update) {
  const message = update?.message;
  const text = String(message?.text || "").trim();

  if (!text) {
    return;
  }

  if (!text.startsWith("/")) {
    const xUrl = extractFirstXPostUrl(text);

    if (!xUrl) {
      return;
    }

    const chatId = String(message?.chat?.id || "").trim();

    if (!(await ensureAllowedChat(chatId))) {
      return;
    }

    state.lastCommandAt = new Date().toISOString();
    state.lastCommand = "linkedin";

    try {
      const draft = await createLinkedinDraft({
        xUrl,
        origin: "telegram-link"
      });
      await sendLinkedinDraftReply(chatId, draft);
    } catch (error) {
      await sendCommandReply(chatId, buildLinkedinErrorMessage(error));
    }

    return;
  }

  const command = normalizeCommand(text);

  if (!command) {
    return;
  }

  state.lastCommandAt = new Date().toISOString();
  state.lastCommand = command;
  await handleTelegramCommand(command, message);
}

async function pollTelegramUpdates() {
  while (state.active) {
    const config = getTelegramBotRunnerConfig();

    if (!canRunTelegramBot(config)) {
      state.lastError =
        "Telegram commands are disabled. Set TELEGRAM_COMMANDS_ENABLED=1 and provide TELEGRAM_BOT_TOKEN plus TELEGRAM_ALLOWED_CHAT_ID or TELEGRAM_CHAT_ID.";
      await wait(RETRY_DELAY_MS);
      continue;
    }

    try {
      state.running = true;
      state.allowedChatId = config.allowedChatId;
      const response = await callTelegramApi(
        "getUpdates",
        {
          offset: state.lastUpdateId ? state.lastUpdateId + 1 : undefined,
          timeout: config.pollingTimeoutSeconds,
          allowed_updates: ["message"]
        },
        config
      );
      const updates = Array.isArray(response.result) ? response.result : [];

      state.lastPollAt = new Date().toISOString();
      state.lastError = "";

      for (const update of updates) {
        const updateId = Number(update?.update_id || 0);

        if (updateId > state.lastUpdateId) {
          state.lastUpdateId = updateId;
        }

        await handleTelegramUpdate(update);
      }
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : "Telegram polling failed.";
      await wait(RETRY_DELAY_MS);
    } finally {
      state.running = false;
    }
  }
}

export async function startTelegramBotRunner() {
  if (state.active) {
    return getTelegramBotStatus();
  }

  const config = getTelegramBotRunnerConfig();

  if (!canRunTelegramBot(config)) {
    state = {
      ...state,
      active: false,
      running: false,
      startedAt: "",
      allowedChatId: config.allowedChatId,
      lastError:
        "Telegram commands are disabled. Set TELEGRAM_COMMANDS_ENABLED=1 and provide TELEGRAM_BOT_TOKEN plus TELEGRAM_ALLOWED_CHAT_ID or TELEGRAM_CHAT_ID."
    };

    return getTelegramBotStatus();
  }

  state = {
    ...state,
    active: true,
    startedAt: new Date().toISOString(),
    lastError: "",
    allowedChatId: config.allowedChatId
  };

  try {
    await syncTelegramCommands(config);
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "Telegram command sync failed.";
  }

  pollLoopPromise = pollTelegramUpdates().catch((error) => {
    state.lastError = error instanceof Error ? error.message : "Telegram runner crashed.";
    state.running = false;
  });
  pollLoopPromise.catch(() => {});

  return getTelegramBotStatus();
}

export function stopTelegramBotRunner() {
  state = {
    ...state,
    active: false,
    running: false
  };
}

export function getTelegramBotStatus() {
  const config = getTelegramBotRunnerConfig();

  return {
    active: state.active,
    running: state.running,
    startedAt: state.startedAt,
    lastPollAt: state.lastPollAt,
    lastUpdateId: state.lastUpdateId,
    lastCommandAt: state.lastCommandAt,
    lastCommand: state.lastCommand,
    lastError: state.lastError,
    commandsSyncedAt: state.commandsSyncedAt,
    commandsEnabled: config.commandsEnabled,
    allowedChatIdConfigured: Boolean(config.allowedChatId),
    botTokenConfigured: Boolean(config.telegramBotToken)
  };
}
