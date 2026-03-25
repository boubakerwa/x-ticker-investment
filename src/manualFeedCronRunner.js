import { executePipelineJob } from "./orchestrator.js";
import { getFeedProviderConfig } from "./feedProvider.js";
import { listPendingManualPosts } from "./manualPostProcessingStore.js";

const DEFAULT_INTERVAL_HOURS = 6;
const DEFAULT_MAX_POST_AGE_HOURS = 24;

let timer = null;
let state = {
  active: false,
  running: false,
  startedAt: "",
  nextRunAt: "",
  lastRunAt: "",
  lastRunId: "",
  lastJobId: "",
  lastError: "",
  lastSkippedReason: "",
  intervalHours: DEFAULT_INTERVAL_HOURS,
  maxPostAgeHours: DEFAULT_MAX_POST_AGE_HOURS,
  lastEligibleCount: 0,
  lastPendingCount: 0
};

function clampPositiveHours(value, fallbackValue) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallbackValue;
  }

  return Math.max(1, Math.round(numericValue));
}

function waitMsForNextRun(intervalHours) {
  return Math.max(1000, intervalHours * 60 * 60 * 1000);
}

function clearScheduledTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleNextExecution() {
  clearScheduledTimer();

  if (!state.active) {
    state.nextRunAt = "";
    return;
  }

  const nextRunAt = new Date(Date.now() + waitMsForNextRun(state.intervalHours)).toISOString();
  state.nextRunAt = nextRunAt;

  timer = setTimeout(() => {
    executeScheduledRun();
  }, waitMsForNextRun(state.intervalHours));
  timer.unref?.();
}

export function getManualFeedCronConfig() {
  return {
    intervalHours: clampPositiveHours(
      process.env.MANUAL_FEED_CRON_INTERVAL_HOURS || DEFAULT_INTERVAL_HOURS,
      DEFAULT_INTERVAL_HOURS
    ),
    maxPostAgeHours: clampPositiveHours(
      process.env.MANUAL_FEED_CRON_MAX_POST_AGE_HOURS || DEFAULT_MAX_POST_AGE_HOURS,
      DEFAULT_MAX_POST_AGE_HOURS
    )
  };
}

async function executeScheduledRun() {
  if (!state.active || state.running) {
    return;
  }

  state.running = true;
  state.lastError = "";

  try {
    if (getFeedProviderConfig().activeProvider !== "manual") {
      state.lastEligibleCount = 0;
      state.lastPendingCount = 0;
      state.lastSkippedReason = "Feed provider is not set to manual mode.";
      return;
    }

    const pendingState = listPendingManualPosts({
      maxPostAgeHours: state.maxPostAgeHours
    });

    state.lastEligibleCount = pendingState.eligibleCount;
    state.lastPendingCount = pendingState.pendingCount;

    if (!pendingState.manualModeActive) {
      state.lastSkippedReason = "Manual feed mode is not active.";
      return;
    }

    if (!pendingState.eligibleCount) {
      state.lastSkippedReason = `No manual posts younger than ${state.maxPostAgeHours} hours are waiting.`;
      return;
    }

    if (!pendingState.pendingCount) {
      state.lastSkippedReason = "All eligible manual posts have already been processed.";
      return;
    }

    const result = await executePipelineJob({
      trigger: "manual-feed-cron",
      reason: `${pendingState.pendingCount} pending manual post(s)`,
      meta: {
        pendingManualPostCount: pendingState.pendingCount,
        eligibleManualPostCount: pendingState.eligibleCount,
        maxPostAgeHours: state.maxPostAgeHours
      }
    });

    state.lastRunAt = result.run.generatedAt;
    state.lastRunId = result.run.id;
    state.lastJobId = result.jobId;
    state.lastSkippedReason = "";
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "Manual feed cron failed.";
  } finally {
    state.running = false;
    scheduleNextExecution();
  }
}

export function startManualFeedCronRunner({
  intervalHours = getManualFeedCronConfig().intervalHours,
  maxPostAgeHours = getManualFeedCronConfig().maxPostAgeHours
} = {}) {
  clearScheduledTimer();

  state = {
    ...state,
    active: true,
    running: false,
    startedAt: new Date().toISOString(),
    nextRunAt: "",
    intervalHours: clampPositiveHours(intervalHours, DEFAULT_INTERVAL_HOURS),
    maxPostAgeHours: clampPositiveHours(maxPostAgeHours, DEFAULT_MAX_POST_AGE_HOURS),
    lastError: "",
    lastSkippedReason: ""
  };

  scheduleNextExecution();
  return getManualFeedCronStatus();
}

export function stopManualFeedCronRunner() {
  clearScheduledTimer();

  state = {
    ...state,
    active: false,
    running: false,
    nextRunAt: "",
    lastSkippedReason: "Paused"
  };
}

export function getManualFeedCronStatus() {
  return {
    ...state
  };
}
