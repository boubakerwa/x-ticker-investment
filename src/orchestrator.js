import { getLatestPipelineSnapshot, getPipelineRun } from "./pipelineStore.js";
import { runPipeline } from "./pipelineRunner.js";
import { readFinancialProfile } from "./financialProfileStore.js";
import { buildDailyDigest, buildFailureAlert, buildPipelineAlert } from "./reportBuilder.js";
import { getNotificationStatus, sendNotification } from "./notificationProvider.js";
import {
  createRuntimeJob,
  getActiveRuntimeJob,
  listRuntimeJobs,
  markRuntimeJobCompleted,
  markRuntimeJobFailed,
  markRuntimeJobRunning
} from "./runtimeJobStore.js";

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
  const activeJob = getActiveRuntimeJob(jobType);

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

export async function executePipelineJob({ trigger = "manual", reason = "", meta = {} } = {}) {
  assertNoActiveJob("pipeline.refresh", trigger, reason);

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
