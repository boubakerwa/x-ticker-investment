import {
  describeBackgroundPipelineSchedule,
  getBackgroundPipelineStatus
} from "./backgroundPipelineRunner.js";
import { buildCurrentDecisionReviewState } from "./decisionReviewStore.js";
import { readFinancialProfile } from "./financialProfileStore.js";
import { getOrchestratorStatus } from "./orchestrator.js";
import {
  callTelegramApi,
  getNotificationConfig,
  getNotificationStatus,
  sendTelegramTextMessage
} from "./notificationProvider.js";
import { getLatestPipelineSnapshot, getPipelineRun } from "./pipelineStore.js";
import { buildDailyDigest } from "./reportBuilder.js";

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
    command: "help",
    description: "Show available commands"
  }
];

const DEFAULT_POLLING_TIMEOUT_SECONDS = 30;
const RETRY_DELAY_MS = 3000;

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
    footer: "Commands are limited to the configured operator chat while the local server is running."
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
