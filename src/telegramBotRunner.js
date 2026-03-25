import {
  describeBackgroundPipelineSchedule,
  getBackgroundPipelineStatus
} from "./backgroundPipelineRunner.js";
import { buildCurrentDecisionReviewState } from "./decisionReviewStore.js";
import { monitoredUniverse } from "./data.js";
import { readFinancialProfile } from "./financialProfileStore.js";
import { executePipelineJob, getOrchestratorStatus } from "./orchestrator.js";
import {
  callTelegramApi,
  getNotificationConfig,
  getNotificationStatus,
  sendTelegramTextMessage
} from "./notificationProvider.js";
import { getLatestPipelineSnapshot, getPipelineRun } from "./pipelineStore.js";
import { buildDailyDigest } from "./reportBuilder.js";
import { createSource, listSources } from "./sourceStore.js";
import { listPendingManualPosts } from "./manualPostProcessingStore.js";
import { importAttributedManualPosts } from "./tweetStore.js";

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
    command: "ingest",
    description: "Import pasted posts into the manual feed"
  },
  {
    command: "process",
    description: "Process queued manual tweets"
  },
  {
    command: "help",
    description: "Show available commands"
  }
];

const DEFAULT_POLLING_TIMEOUT_SECONDS = 30;
const RETRY_DELAY_MS = 3000;
const TELEGRAM_IMPORT_DEFAULT_RELIABILITY = 0.62;

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
    handle: header.handle,
    createdAt: header.createdAt,
    body
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

  const lines = normalizedRawPosts.split("\n");
  const headerCount = lines.filter((line) => looksLikeTelegramImportHeader(line.trim())).length;

  if (headerCount === 1) {
    return {
      showHelp: false,
      replaceExisting,
      posts: [parseTelegramImportBlock(normalizedRawPosts)]
    };
  }

  const blocks = [];
  let currentBlockLines = [];

  for (const line of lines) {
    const lineText = String(line || "");
    const trimmedLine = lineText.trim();

    if (!trimmedLine) {
      if (currentBlockLines.length) {
        currentBlockLines.push("");
      }
      continue;
    }

    if (looksLikeTelegramImportHeader(trimmedLine)) {
      if (currentBlockLines.length) {
        blocks.push(currentBlockLines.join("\n"));
      }

      currentBlockLines = [trimmedLine];
      continue;
    }

    if (!currentBlockLines.length) {
      throw new Error(
        "Each imported post must start with @handle followed by a colon or line break."
      );
    }

    currentBlockLines.push(lineText);
  }

  if (currentBlockLines.length) {
    blocks.push(currentBlockLines.join("\n"));
  }

  if (!blocks.length) {
    throw new Error(
      "Paste at least one post after /ingest. Use /ingest help to see the expected format."
    );
  }

  return {
    showHelp: false,
    replaceExisting,
    posts: blocks.map((block) => parseTelegramImportBlock(block))
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

function resolveTelegramImportSource(handle, sourcesByHandle) {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  const existingSource = sourcesByHandle.get(normalizedHandle);

  if (existingSource) {
    return {
      source: existingSource,
      created: false
    };
  }

  const createdSource = createSource(buildTelegramImportSource(handle));
  sourcesByHandle.set(normalizedHandle, createdSource);

  return {
    source: createdSource,
    created: true
  };
}

function buildIngestHelpMessage() {
  return {
    title: "Telegram ingest",
    summary: "Use /ingest to append or replace the manual queue with pasted posts.",
    highlights: [
      "/ingest append",
      "@semiflow: Broadening risk appetite keeps semis bid; still constructive on NVDA.",
      "2026-03-24T11:45:00Z | @btcwatch: BTC positioning still looks louder than spot demand.",
      "Separate multiple posts with a blank line.",
      "Use /process to analyse the queued tweets."
    ],
    footer:
      "The scheduler can stay off when you use Telegram as the manual signal inbox."
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
  const attributedPosts = request.posts.map((post) => {
    const resolved = resolveTelegramImportSource(post.handle, sourcesByHandle);

    if (resolved.created) {
      createdSourceCount += 1;
    }

    sourceIds.add(resolved.source.id);

    return {
      sourceId: resolved.source.id,
      createdAt: post.createdAt,
      body: post.body,
      actionable: false,
      claimType: "Operator commentary",
      direction: "Mixed",
      explicitness: "Explicit",
      themes: [],
      confidence: TELEGRAM_IMPORT_DEFAULT_RELIABILITY,
      mappedAssets: [],
      clusterId: "cluster-enterprise-ai"
    };
  });

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
    highlights: TELEGRAM_BOT_COMMANDS.map((item) => `/${item.command} · ${item.description}`),
    footer:
      "Commands are limited to the configured operator chat while the local server is running. Use /ingest help for the queue format."
  };
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

async function sendCommandReply(chatId, message) {
  return sendTelegramTextMessage({
    chatId,
    message,
    config: getTelegramBotRunnerConfig()
  });
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

  if (!chatId) {
    return;
  }

  if (chatId !== state.allowedChatId) {
    await sendCommandReply(chatId, {
      title: "X-Ticker access restricted",
      summary: "This bot is currently limited to its configured operator chat.",
      footer: "Update TELEGRAM_ALLOWED_CHAT_ID if you want to move it to a different chat."
    });
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

  await sendCommandReply(chatId, {
    title: "Unknown command",
    summary: `/${command} is not configured yet.`,
    highlights: TELEGRAM_BOT_COMMANDS.map((item) => `/${item.command} · ${item.description}`)
  });
}

async function handleTelegramUpdate(update) {
  const message = update?.message;
  const text = String(message?.text || "").trim();

  if (!text.startsWith("/")) {
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
