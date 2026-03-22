import { executePipelineJob } from "./orchestrator.js";

const DEFAULT_INTERVAL_MINUTES = Number(process.env.PIPELINE_INTERVAL_MINUTES || 15);

let timer = null;
let state = {
  active: false,
  running: false,
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  startedAt: "",
  nextRunAt: "",
  lastRunAt: "",
  lastRunId: "",
  lastError: "",
  lastJobId: ""
};

function computeNextRunAt(intervalMinutes) {
  return new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
}

async function executeScheduledRun() {
  if (!state.active || state.running) {
    return;
  }

  state.running = true;
  state.lastError = "";

  try {
    const result = await executePipelineJob({
      trigger: "background-scheduler",
      reason: "Scheduled pipeline refresh"
    });
    const run = result.run;

    state.lastRunAt = run.generatedAt;
    state.lastRunId = run.id;
    state.lastJobId = result.jobId;
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "Scheduled run failed.";
  } finally {
    state.running = false;
    state.nextRunAt = computeNextRunAt(state.intervalMinutes);
  }
}

export function startBackgroundPipelineRunner({
  intervalMinutes = DEFAULT_INTERVAL_MINUTES
} = {}) {
  if (intervalMinutes <= 0) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    state = {
      ...state,
      active: false,
      intervalMinutes,
      startedAt: state.startedAt || new Date().toISOString(),
      nextRunAt: "",
      lastJobId: state.lastJobId,
      lastError: "Background runner disabled because PIPELINE_INTERVAL_MINUTES <= 0."
    };
    return getBackgroundPipelineStatus();
  }

  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  state = {
    ...state,
    active: true,
    running: false,
    intervalMinutes,
    startedAt: new Date().toISOString(),
    nextRunAt: computeNextRunAt(intervalMinutes),
    lastJobId: state.lastJobId,
    lastError: ""
  };

  timer = setInterval(() => {
    executeScheduledRun();
  }, intervalMinutes * 60 * 1000);

  timer.unref?.();
  return getBackgroundPipelineStatus();
}

export function stopBackgroundPipelineRunner() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  state = {
    ...state,
    active: false,
    running: false,
    nextRunAt: ""
  };
}

export function getBackgroundPipelineStatus() {
  return {
    ...state
  };
}
