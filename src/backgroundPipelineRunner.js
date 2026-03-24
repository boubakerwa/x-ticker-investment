import { executePipelineJob } from "./orchestrator.js";

const DEFAULT_INTERVAL_MINUTES = Number(process.env.PIPELINE_INTERVAL_MINUTES || 15);
const FALLBACK_TIMEZONE = "UTC";
const DEFAULT_SCHEDULE_TIMES = parseScheduleTimes(process.env.PIPELINE_SCHEDULE_TIMES || "");
const DEFAULT_TIMEZONE = normalizeTimezone(
  process.env.PIPELINE_SCHEDULE_TIMEZONE ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    FALLBACK_TIMEZONE
);

const zonedDateTimeFormatters = new Map();

let timer = null;
let state = {
  active: false,
  running: false,
  mode: DEFAULT_SCHEDULE_TIMES.length ? "daily-times" : "interval",
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  scheduleTimes: DEFAULT_SCHEDULE_TIMES,
  timezone: DEFAULT_TIMEZONE,
  scheduleDescription: DEFAULT_SCHEDULE_TIMES.length
    ? describeSchedule({
        active: true,
        mode: "daily-times",
        scheduleTimes: DEFAULT_SCHEDULE_TIMES,
        timezone: DEFAULT_TIMEZONE
      })
    : describeSchedule({
        active: true,
        mode: "interval",
        intervalMinutes: DEFAULT_INTERVAL_MINUTES
      }),
  startedAt: "",
  nextRunAt: "",
  lastRunAt: "",
  lastRunId: "",
  lastError: "",
  lastJobId: ""
};

function clampIntervalMinutes(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_INTERVAL_MINUTES;
  }

  return Math.max(0, Math.round(numericValue));
}

function parseScheduleTimes(value) {
  const tokens = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  return [...new Set(tokens.map(normalizeScheduleTime).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function normalizeScheduleTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());

  if (!match) {
    return "";
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return "";
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeTimezone(value) {
  const candidate = String(value || "").trim() || FALLBACK_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en-CA", {
      timeZone: candidate,
      year: "numeric"
    }).format(new Date());
    return candidate;
  } catch (_error) {
    return FALLBACK_TIMEZONE;
  }
}

function buildZonedDateTimeFormatter(timezone) {
  const cacheKey = timezone || DEFAULT_TIMEZONE;

  if (!zonedDateTimeFormatters.has(cacheKey)) {
    zonedDateTimeFormatters.set(
      cacheKey,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: cacheKey,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      })
    );
  }

  return zonedDateTimeFormatters.get(cacheKey);
}

function getZonedDateTimeParts(timestampMs, timezone) {
  const formatter = buildZonedDateTimeFormatter(timezone);
  const parts = formatter.formatToParts(new Date(timestampMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: values.year || "",
    month: values.month || "",
    day: values.day || "",
    hour: values.hour || "",
    minute: values.minute || ""
  };
}

function describeSchedule({
  active = false,
  mode = "interval",
  intervalMinutes = DEFAULT_INTERVAL_MINUTES,
  scheduleTimes = [],
  timezone = DEFAULT_TIMEZONE
} = {}) {
  if (!active) {
    return "Manual only";
  }

  if (mode === "daily-times" && scheduleTimes.length) {
    return `Daily at ${scheduleTimes.join(", ")} (${timezone})`;
  }

  return `Every ${intervalMinutes} min`;
}

function buildSchedulerConfig({
  intervalMinutes = DEFAULT_INTERVAL_MINUTES,
  scheduleTimes = DEFAULT_SCHEDULE_TIMES,
  timezone = DEFAULT_TIMEZONE
} = {}) {
  const normalizedScheduleTimes = parseScheduleTimes(scheduleTimes);
  const normalizedTimezone = normalizeTimezone(timezone);
  const normalizedIntervalMinutes = clampIntervalMinutes(intervalMinutes);

  if (normalizedScheduleTimes.length) {
    return {
      active: true,
      mode: "daily-times",
      intervalMinutes: normalizedIntervalMinutes,
      scheduleTimes: normalizedScheduleTimes,
      timezone: normalizedTimezone,
      scheduleDescription: describeSchedule({
        active: true,
        mode: "daily-times",
        scheduleTimes: normalizedScheduleTimes,
        timezone: normalizedTimezone
      }),
      disabledReason: ""
    };
  }

  if (normalizedIntervalMinutes <= 0) {
    return {
      active: false,
      mode: "disabled",
      intervalMinutes: normalizedIntervalMinutes,
      scheduleTimes: [],
      timezone: normalizedTimezone,
      scheduleDescription: "Manual only",
      disabledReason:
        "Background runner disabled because no valid PIPELINE_SCHEDULE_TIMES are configured and PIPELINE_INTERVAL_MINUTES <= 0."
    };
  }

  return {
    active: true,
    mode: "interval",
    intervalMinutes: normalizedIntervalMinutes,
    scheduleTimes: [],
    timezone: normalizedTimezone,
    scheduleDescription: describeSchedule({
      active: true,
      mode: "interval",
      intervalMinutes: normalizedIntervalMinutes
    }),
    disabledReason: ""
  };
}

function computeNextDailyRunAt({ scheduleTimes = [], timezone = DEFAULT_TIMEZONE } = {}) {
  if (!scheduleTimes.length) {
    return "";
  }

  const targetTimes = new Set(scheduleTimes);
  const startMinuteMs = Math.ceil((Date.now() + 1000) / 60000) * 60000;
  const maxMinutesToSearch = 60 * 72;

  for (let offset = 0; offset <= maxMinutesToSearch; offset += 1) {
    const candidateMs = startMinuteMs + offset * 60 * 1000;
    const parts = getZonedDateTimeParts(candidateMs, timezone);
    const localTime = `${parts.hour}:${parts.minute}`;

    if (targetTimes.has(localTime)) {
      return new Date(candidateMs).toISOString();
    }
  }

  return "";
}

function computeNextRunAt({
  active = false,
  mode = "interval",
  intervalMinutes = DEFAULT_INTERVAL_MINUTES,
  scheduleTimes = [],
  timezone = DEFAULT_TIMEZONE
} = {}) {
  if (!active) {
    return "";
  }

  if (mode === "daily-times") {
    return computeNextDailyRunAt({
      scheduleTimes,
      timezone
    });
  }

  return new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
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

  const nextRunAt = computeNextRunAt(state);

  if (!nextRunAt) {
    state.active = false;
    state.nextRunAt = "";
    state.lastError = "Failed to compute the next scheduled pipeline run.";
    state.scheduleDescription = "Manual only";
    return;
  }

  state.nextRunAt = nextRunAt;
  const delayMs = Math.max(1000, new Date(nextRunAt).getTime() - Date.now());
  timer = setTimeout(() => {
    executeScheduledRun();
  }, delayMs);
  timer.unref?.();
}

export function describeBackgroundPipelineSchedule(status = getBackgroundPipelineStatus()) {
  return describeSchedule(status);
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
    scheduleNextExecution();
  }
}

export function startBackgroundPipelineRunner({
  intervalMinutes = DEFAULT_INTERVAL_MINUTES,
  scheduleTimes = DEFAULT_SCHEDULE_TIMES,
  timezone = DEFAULT_TIMEZONE
} = {}) {
  const config = buildSchedulerConfig({
    intervalMinutes,
    scheduleTimes,
    timezone
  });

  clearScheduledTimer();

  if (!config.active) {
    state = {
      ...state,
      active: false,
      running: false,
      mode: config.mode,
      intervalMinutes: config.intervalMinutes,
      scheduleTimes: config.scheduleTimes,
      timezone: config.timezone,
      scheduleDescription: config.scheduleDescription,
      startedAt: state.startedAt || new Date().toISOString(),
      nextRunAt: "",
      lastJobId: state.lastJobId,
      lastError: config.disabledReason
    };
    return getBackgroundPipelineStatus();
  }

  state = {
    ...state,
    active: true,
    running: false,
    mode: config.mode,
    intervalMinutes: config.intervalMinutes,
    scheduleTimes: config.scheduleTimes,
    timezone: config.timezone,
    scheduleDescription: config.scheduleDescription,
    startedAt: new Date().toISOString(),
    nextRunAt: "",
    lastJobId: state.lastJobId,
    lastError: ""
  };

  scheduleNextExecution();
  return getBackgroundPipelineStatus();
}

export function stopBackgroundPipelineRunner() {
  clearScheduledTimer();

  state = {
    ...state,
    active: false,
    running: false,
    nextRunAt: "",
    scheduleDescription: "Manual only"
  };
}

export function getBackgroundPipelineStatus() {
  return {
    ...state
  };
}
