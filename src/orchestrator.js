import { getLatestPipelineSnapshot, getPipelineRun } from "./pipelineStore.js";
import { runPipeline } from "./pipelineRunner.js";
import { readFinancialProfile } from "./financialProfileStore.js";
import { buildDailyDigest, buildFailureAlert, buildPipelineAlert } from "./reportBuilder.js";
import { getNotificationStatus, sendNotification } from "./notificationProvider.js";
import { getFeedProviderConfig } from "./feedProvider.js";
import { listPendingManualPosts, markManualPostsProcessed } from "./manualPostProcessingStore.js";
import {
  createRuntimeJob,
  getActiveRuntimeJob,
  listRuntimeJobs,
  markRuntimeJobCompleted,
  markRuntimeJobFailed,
  markRuntimeJobRunning
} from "./runtimeJobStore.js";

const DEFAULT_STALE_JOB_MINUTES = 30;
const SILENT_PIPELINE_NOTIFICATION_TRIGGERS = new Set(["telegram-manual-process"]);

function getStaleJobThresholdMs() {
  const configuredMinutes = Number(process.env.RUNTIME_JOB_STALE_MINUTES || DEFAULT_STALE_JOB_MINUTES);

  if (!Number.isFinite(configuredMinutes) || configuredMinutes <= 0) {
    return DEFAULT_STALE_JOB_MINUTES * 60 * 1000;
  }

  return Math.max(1, Math.round(configuredMinutes)) * 60 * 1000;
}

function getJobReferenceTimeMs(job) {
  const candidate = new Date(job?.startedAt || job?.requestedAt || "").getTime();
  return Number.isFinite(candidate) ? candidate : Number.NaN;
}

function shouldRecoverStaleActiveJob(activeJob) {
  if (!activeJob) {
    return false;
  }

  const referenceTimeMs = getJobReferenceTimeMs(activeJob);

  if (!Number.isFinite(referenceTimeMs)) {
    return false;
  }

  const latestSnapshot = getLatestPipelineSnapshot();
  const latestSnapshotTimeMs = new Date(latestSnapshot?.generatedAt || "").getTime();

  if (Number.isFinite(latestSnapshotTimeMs) && latestSnapshotTimeMs > referenceTimeMs) {
    return true;
  }

  return Date.now() - referenceTimeMs > getStaleJobThresholdMs();
}

function buildJobConflictError({ jobType, trigger, reason, activeJob }) {
  const error = new Error(
    `A ${jobType} job is already ${activeJob.status} (${activeJob.id}); wait for it to finish before starting another ${trigger} request${reason ? ` for ${reason}` : ""}.`
  );
  error.statusCode = 409;
  error.code = "runtime_job_conflict";
  error.activeJob = activeJob;
  return error;
}

function assertNoActiveJob(jobType, trigger, reason) {
  let activeJob = getActiveRuntimeJob(jobType);

  if (shouldRecoverStaleActiveJob(activeJob)) {
    markRuntimeJobFailed(
      activeJob.id,
      new Error(
        `Recovered stale ${jobType} job after it outlived the active runtime window without a completion marker.`
      ),
      {
        finishedAt: new Date().toISOString()
      }
    );
    activeJob = getActiveRuntimeJob(jobType);
  }

  if (activeJob) {
    throw buildJobConflictError({
      jobType,
      trigger,
      reason,
      activeJob
    });
  }
}

export function getOrchestratorStatus() {
  const runtimeJobs = listRuntimeJobs(20);
  const notificationStatus = getNotificationStatus();

  return {
    jobs: runtimeJobs,
    notifications: notificationStatus
  };
}

function shouldSendPipelineNotifications(trigger) {
  return !SILENT_PIPELINE_NOTIFICATION_TRIGGERS.has(String(trigger || "").trim());
}

export async function executePipelineJob({ trigger = "manual", reason = "", meta = {} } = {}) {
  assertNoActiveJob("pipeline.refresh", trigger, reason);
  const pendingManualState =
    getFeedProviderConfig().activeProvider === "manual"
      ? listPendingManualPosts()
      : {
          pendingPosts: []
        };
  const pendingManualPosts = pendingManualState.pendingPosts || [];

  const job = createRuntimeJob({
    type: "pipeline.refresh",
    trigger,
    input: {
      reason
    },
    meta
  });

  markRuntimeJobRunning(job.id);

  try {
    const run = await runPipeline({
      trigger,
      reason
    });
    if (pendingManualPosts.length) {
      markManualPostsProcessed(pendingManualPosts, {
        processedAt: run.generatedAt
      });
    }
    if (shouldSendPipelineNotifications(trigger)) {
      const financialProfile = readFinancialProfile();

      await sendNotification({
        eventType: "pipeline.completed",
        message: buildPipelineAlert(run, {
          financialProfile
        }),
        payload: {
          runId: run.id,
          trigger
        }
      });
    }

    markRuntimeJobCompleted(job.id, {
      relatedRunId: run.id,
      output: {
        runId: run.id,
        summary: run.summary
      }
    });

    return {
      jobId: job.id,
      run
    };
  } catch (error) {
    if (shouldSendPipelineNotifications(trigger)) {
      await sendNotification({
        eventType: "pipeline.failed",
        message: buildFailureAlert({
          title: "Pipeline run failed",
          summary: `The ${trigger} pipeline refresh did not complete.`,
          errorMessage: error instanceof Error ? error.message : String(error || "Unknown pipeline error."),
          facts: [
            {
              label: "Trigger",
              value: trigger
            }
          ]
        }),
        payload: {
          trigger,
          reason
        }
      });
    }

    markRuntimeJobFailed(job.id, error);
    throw error;
  }
}

export async function sendDailyDigest({ trigger = "manual", reason = "" } = {}) {
  assertNoActiveJob("report.daily", trigger, reason);

  const job = createRuntimeJob({
    type: "report.daily",
    trigger,
    input: {
      reason
    }
  });

  markRuntimeJobRunning(job.id);

  try {
    const latestSnapshot = getLatestPipelineSnapshot();
    const latestRun = latestSnapshot?.runId ? getPipelineRun(latestSnapshot.runId) : null;
    const runtimeJobs = listRuntimeJobs(12);
    const notificationStatus = getNotificationStatus();
    const financialProfile = readFinancialProfile();
    const digest = buildDailyDigest({
      latestSnapshot,
      latestRun,
      runtimeJobs,
      notificationStatus,
      financialProfile
    });
    const notificationEvent = await sendNotification({
      eventType: "report.daily",
      message: digest,
      payload: {
        latestRunId: latestRun?.id || "",
        trigger
      }
    });

    markRuntimeJobCompleted(job.id, {
      relatedRunId: latestRun?.id || "",
      output: {
        latestRunId: latestRun?.id || "",
        notificationId: notificationEvent?.id || ""
      }
    });

    return {
      jobId: job.id,
      notificationEvent,
      digest
    };
  } catch (error) {
    markRuntimeJobFailed(job.id, error);
    throw error;
  }
}
