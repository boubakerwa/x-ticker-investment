import {
  describeBackgroundPipelineSchedule,
  getBackgroundPipelineStatus
} from "./backgroundPipelineRunner.js";
import { buildCurrentDecisionReviewState } from "./decisionReviewStore.js";
import { listDecisionHistory, listPipelineRuns } from "./pipelineStore.js";

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
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

function sortDecisionsByPriority(decisions) {
  const actionPriority = {
    SELL: 3,
    BUY: 2,
    HOLD: 1
  };

  return [...decisions].sort((left, right) => {
    const leftPriority = actionPriority[left.action] || 0;
    const rightPriority = actionPriority[right.action] || 0;

    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority;
    }

    return (right.confidence || 0) - (left.confidence || 0);
  });
}

function getTrackedDecisionsFromSnapshot(snapshot, financialProfile) {
  const trackedTickers = getTrackedTickers(financialProfile);
  const decisions = snapshot?.appData?.decisions || [];

  return sortDecisionsByPriority(decisions.filter((decision) => trackedTickers.includes(decision.asset)));
}

function getTrackedDecisionsFromRun(run, financialProfile) {
  const trackedTickers = getTrackedTickers(financialProfile);
  return sortDecisionsByPriority((run?.decisions || []).filter((decision) => trackedTickers.includes(decision.asset)));
}

function buildDecisionHighlights(decisions) {
  return decisions.slice(0, 3).map((decision) => {
    const confidence = Math.round((decision.confidence || 0) * 100);
    const headline = decision.rationale?.[0] || "No rationale captured.";
    return `${decision.asset} ${decision.action} · ${confidence}% · ${headline}`;
  });
}

function formatReviewStatus(status) {
  return String(status || "proposed").replace(/^./, (character) => character.toUpperCase());
}

function buildReviewHighlights(items) {
  return items.slice(0, 3).map((item) => {
    const confidence = Math.round((item.confidence || 0) * 100);
    return `${item.asset} ${item.action} · ${confidence}% · ${formatReviewStatus(item.reviewStatus)}`;
  });
}

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

export function buildDailyDigest({
  latestSnapshot,
  latestRun,
  runtimeJobs = [],
  notificationStatus,
  financialProfile = {}
}) {
  const scheduler = getBackgroundPipelineStatus();
  const recentRuns = listPipelineRuns(3);
  const decisionHistory = listDecisionHistory(12);
  const topDecision = decisionHistory[0];
  const trackedTickers = getTrackedTickers(financialProfile);
  const trackedDecisions = getTrackedDecisionsFromSnapshot(latestSnapshot, financialProfile);
  const topTrackedDecision = trackedDecisions[0] || null;
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
  const highlights = reviewState.queue.length
    ? buildReviewHighlights(reviewState.queue)
    : trackedDecisions.length
      ? buildDecisionHighlights(trackedDecisions)
      : trackedTickers.length
        ? ["No active decisions yet for your tracked assets."]
        : ["Add holdings or a watchlist to personalize the daily digest."];

  return {
    title: "Daily operator digest",
    summary:
      topPendingReview
        ? `Approval queue: ${topPendingReview.asset} is still ${topPendingReview.action} and needs review.`
        : topTrackedDecision
        ? `Portfolio focus: ${topTrackedDecision.asset} is currently ${topTrackedDecision.action} at ${Math.round(topTrackedDecision.confidence * 100)}% confidence.`
        : latestRun?.summary?.decisionCount > 0
          ? `Latest run produced ${latestRun.summary.decisionCount} decisions and ${latestRun.summary.vetoCount} vetoes.`
          : "Latest run completed without fresh decisions.",
    facts: [
      {
        label: "Latest run",
        value: latestRun?.id || latestSnapshot?.runId || "No pipeline run yet"
      },
      {
        label: "Tracked assets",
        value: trackedTickers.length ? trackedTickers.join(", ") : "Not configured"
      },
      {
        label: "Tracked calls",
        value: trackedDecisions.length ? String(trackedDecisions.length) : "0"
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
        label: "Scheduler",
        value: scheduler.active
          ? `Active · ${describeBackgroundPipelineSchedule(scheduler)}`
          : "Paused"
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
        label: "Top tracked call",
        value: topTrackedDecision
          ? `${topTrackedDecision.asset} ${topTrackedDecision.action} · ${Math.round(topTrackedDecision.confidence * 100)}%`
          : topDecision
            ? `${topDecision.asset} ${topDecision.action} · ${Math.round(topDecision.confidence * 100)}%`
            : "None"
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
    highlights,
    footer: latestSnapshot?.generatedAt
      ? `Snapshot timestamp: ${latestSnapshot.generatedAt}`
      : "Snapshot pending"
  };
}

export function buildPipelineAlert(run, { financialProfile = {} } = {}) {
  const trackedDecisions = getTrackedDecisionsFromRun(run, financialProfile);
  const topTrackedDecision = trackedDecisions[0] || null;
  const reviewState = run?.snapshot
    ? buildCurrentDecisionReviewState({
        snapshot: run.snapshot,
        financialProfile
      })
    : {
        summary: {
          proposedCount: 0
        },
        queue: []
      };
  const topPendingReview = reviewState.queue.find((item) => item.reviewStatus === "proposed") || null;

  return {
    title: "Pipeline run completed",
    summary:
      topPendingReview
        ? `Run ${run.id} opened ${reviewState.summary.proposedCount} review items; ${topPendingReview.asset} is first in queue.`
        : topTrackedDecision
        ? `Run ${run.id} surfaced a tracked call: ${topTrackedDecision.asset} ${topTrackedDecision.action}.`
        : run.summary.decisionCount > 0
          ? `Run ${run.id} finished with ${run.summary.decisionCount} decisions.`
          : `Run ${run.id} finished without new decisions.`,
    facts: [
      {
        label: "Trigger",
        value: run.trigger
      },
      {
        label: "Tracked calls",
        value: trackedDecisions.length ? String(trackedDecisions.length) : "0"
      },
      {
        label: "Pending review",
        value: String(reviewState.summary.proposedCount || 0)
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
    highlights: reviewState.queue.length
      ? buildReviewHighlights(reviewState.queue)
      : trackedDecisions.length
        ? buildDecisionHighlights(trackedDecisions)
        : [],
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
