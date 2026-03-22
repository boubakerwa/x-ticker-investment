import { getBackgroundPipelineStatus } from "./backgroundPipelineRunner.js";
import { listDecisionHistory, listPipelineRuns } from "./pipelineStore.js";

function formatDecisionSummary(decisionHistory) {
  if (!decisionHistory.length) {
    return "No decisions recorded yet.";
  }

  const byAction = decisionHistory.reduce(
    (accumulator, entry) => {
      accumulator[entry.action] = (accumulator[entry.action] || 0) + 1;
      return accumulator;
    },
    {}
  );

  return Object.entries(byAction)
    .map(([action, count]) => `${count} ${action}`)
    .join(", ");
}

export function buildDailyDigest({ latestSnapshot, latestRun, runtimeJobs = [], notificationStatus }) {
  const scheduler = getBackgroundPipelineStatus();
  const recentRuns = listPipelineRuns(3);
  const decisionHistory = listDecisionHistory(12);
  const topDecision = decisionHistory[0];

  return {
    title: "Daily operator digest",
    summary:
      latestRun?.summary?.decisionCount > 0
        ? `Latest run produced ${latestRun.summary.decisionCount} decisions and ${latestRun.summary.vetoCount} vetoes.`
        : "Latest run completed without fresh decisions.",
    facts: [
      {
        label: "Latest run",
        value: latestRun?.id || latestSnapshot?.runId || "No pipeline run yet"
      },
      {
        label: "Scheduler",
        value: scheduler.active ? `Active · every ${scheduler.intervalMinutes}m` : "Paused"
      },
      {
        label: "Recent runs",
        value: String(recentRuns.length)
      },
      {
        label: "Decision mix",
        value: formatDecisionSummary(decisionHistory.slice(0, 8))
      },
      {
        label: "Top decision",
        value: topDecision ? `${topDecision.asset} ${topDecision.action} · ${Math.round(topDecision.confidence * 100)}%` : "None"
      },
      {
        label: "Jobs tracked",
        value: String(runtimeJobs.length)
      },
      {
        label: "Notifications",
        value: notificationStatus.config.activeProvider
      }
    ],
    footer: latestSnapshot?.generatedAt
      ? `Snapshot timestamp: ${latestSnapshot.generatedAt}`
      : "Snapshot pending"
  };
}

export function buildPipelineAlert(run) {
  return {
    title: "Pipeline run completed",
    summary:
      run.summary.decisionCount > 0
        ? `Run ${run.id} finished with ${run.summary.decisionCount} decisions.`
        : `Run ${run.id} finished without new decisions.`,
    facts: [
      {
        label: "Trigger",
        value: run.trigger
      },
      {
        label: "Extractor",
        value: `${run.summary.extractorMode} · ${run.summary.extractorModel}`
      },
      {
        label: "Clusters",
        value: String(run.summary.clusterCount)
      },
      {
        label: "Decisions",
        value: String(run.summary.decisionCount)
      },
      {
        label: "Vetoes",
        value: String(run.summary.vetoCount)
      }
    ],
    footer: run.generatedAt
  };
}

export function buildFailureAlert({ title, summary, errorMessage, facts = [] }) {
  return {
    title,
    summary,
    facts: [
      ...facts,
      {
        label: "Error",
        value: errorMessage
      }
    ],
    footer: new Date().toISOString()
  };
}
