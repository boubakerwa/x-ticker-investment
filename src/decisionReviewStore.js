import { getDatabase, parseJsonColumn } from "./database.js";

const REVIEW_LIMIT = 240;

export const DECISION_REVIEW_STATUSES = ["proposed", "approved", "dismissed"];

function buildTimestamp() {
  return new Date().toISOString();
}

function normalizeReviewStatus(value) {
  const normalizedValue = String(value || "proposed").trim().toLowerCase();
  return DECISION_REVIEW_STATUSES.includes(normalizedValue) ? normalizedValue : "proposed";
}

function parseDecisionReviewRow(row) {
  return parseJsonColumn(row.payload, null);
}

function trimDecisionReviews() {
  const db = getDatabase();
  const staleRows = db
    .prepare(
      `
        SELECT id
        FROM decision_reviews
        ORDER BY updated_at DESC
        LIMIT -1 OFFSET ?
      `
    )
    .all(REVIEW_LIMIT);

  if (!staleRows.length) {
    return;
  }

  const deleteStatement = db.prepare("DELETE FROM decision_reviews WHERE id = ?");

  for (const row of staleRows) {
    deleteStatement.run(row.id);
  }
}

function persistDecisionReview(review) {
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO decision_reviews(
        id,
        created_at,
        run_id,
        asset,
        status,
        updated_at,
        reviewed_at,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        created_at = excluded.created_at,
        run_id = excluded.run_id,
        asset = excluded.asset,
        status = excluded.status,
        updated_at = excluded.updated_at,
        reviewed_at = excluded.reviewed_at,
        payload = excluded.payload
    `
  ).run(
    review.id,
    review.createdAt,
    review.runId,
    review.asset,
    review.status,
    review.updatedAt,
    review.reviewedAt || null,
    JSON.stringify(review)
  );

  trimDecisionReviews();
  return review;
}

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

function buildDecisionId(runId, asset) {
  const cleanRunId = String(runId || "").trim();
  const cleanTicker = normalizeTicker(asset);
  return cleanRunId && cleanTicker ? `${cleanRunId}:${cleanTicker}` : "";
}

function buildReviewId(asset) {
  const cleanTicker = normalizeTicker(asset);
  return cleanTicker ? `review-${cleanTicker}` : "";
}

function decisionNeedsReview(decision) {
  const action = String(decision?.action || "HOLD").trim().toUpperCase();
  return action === "BUY" || action === "SELL" || Boolean(decision?.vetoed);
}

function buildDecisionFingerprint(decision) {
  return JSON.stringify({
    asset: normalizeTicker(decision?.asset),
    action: String(decision?.action || ""),
    horizon: String(decision?.horizon || ""),
    clusterIds: Array.isArray(decision?.clusterIds) ? decision.clusterIds : [],
    vetoed: Boolean(decision?.vetoed),
    vetoReason: String(decision?.vetoReason || ""),
    rationale: String(decision?.rationale?.[0] || ""),
    regime: String(decision?.marketContext?.regime || ""),
    policyState: String(decision?.marketContext?.policyState || "")
  });
}

function buildReviewSummary(items) {
  const proposedCount = items.filter((item) => item.reviewStatus === "proposed").length;
  const approvedCount = items.filter((item) => item.reviewStatus === "approved").length;
  const dismissedCount = items.filter((item) => item.reviewStatus === "dismissed").length;

  return {
    totalCount: items.length,
    proposedCount,
    approvedCount,
    dismissedCount,
    reviewedCount: approvedCount + dismissedCount,
    nextDecisionId: items.find((item) => item.reviewStatus === "proposed")?.id || ""
  };
}

function sortReviewItems(left, right) {
  const trackedDifference = Number(right.tracked) - Number(left.tracked);

  if (trackedDifference !== 0) {
    return trackedDifference;
  }

  const reviewPriority = {
    proposed: 3,
    approved: 2,
    dismissed: 1
  };
  const reviewDifference =
    (reviewPriority[right.reviewStatus] || 0) - (reviewPriority[left.reviewStatus] || 0);

  if (reviewDifference !== 0) {
    return reviewDifference;
  }

  const actionPriority = {
    SELL: 3,
    BUY: 2,
    HOLD: 1
  };
  const actionDifference = (actionPriority[right.action] || 0) - (actionPriority[left.action] || 0);

  if (actionDifference !== 0) {
    return actionDifference;
  }

  return (right.confidence || 0) - (left.confidence || 0);
}

function buildReviewItem(decision, snapshot, posts, trackedTickers, review) {
  const decisionId = buildDecisionId(snapshot.runId, decision.asset);
  const relatedPosts = posts.filter((post) => (post.mappedAssets || []).includes(decision.asset));

  return {
    id: decisionId,
    reviewId: review?.id || buildReviewId(decision.asset),
    runId: snapshot.runId,
    asset: decision.asset,
    action: decision.action,
    confidence: decision.confidence,
    horizon: decision.horizon,
    summary: review?.summary || decision.rationale?.[0] || "",
    rationale: decision.rationale || [],
    whyNot: decision.whyNot || [],
    uncertainty: decision.uncertainty || [],
    decisionMath: decision.decisionMath || decision.math || null,
    thesisProbability: decision.thesisProbability,
    expectedUpside: decision.expectedUpside,
    expectedDownside: decision.expectedDownside,
    rewardRisk: decision.rewardRisk,
    sizeBand: decision.sizeBand,
    maxLossGuardrail: decision.maxLossGuardrail,
    decisionMathSummary: decision.decisionMathSummary || "",
    tracked: trackedTickers.includes(decision.asset),
    relatedPostCount: relatedPosts.length,
    latestPostAt: relatedPosts[0]?.createdAt || "",
    reviewStatus: review?.status || "proposed",
    reviewNote: review?.note || "",
    reviewedAt: review?.reviewedAt || "",
    reviewUpdatedAt: review?.updatedAt || "",
    carriedForward: Boolean(review?.carriedForwardFromDecisionId)
  };
}

export function listDecisionReviews(limit = REVIEW_LIMIT) {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM decision_reviews
        ORDER BY updated_at DESC
        LIMIT ?
      `
    )
    .all(limit);

  return rows.map((row) => parseDecisionReviewRow(row)).filter(Boolean);
}

export function getDecisionReview(reviewId) {
  const db = getDatabase();
  const row = db.prepare("SELECT payload FROM decision_reviews WHERE id = ?").get(String(reviewId || ""));
  return row ? parseDecisionReviewRow(row) : null;
}

export function indexDecisionReviews(limit = REVIEW_LIMIT) {
  return new Map(listDecisionReviews(limit).map((review) => [review.id, review]));
}

function indexDecisionReviewsByAsset(limit = REVIEW_LIMIT) {
  const reviewsByAsset = new Map();

  for (const review of listDecisionReviews(limit)) {
    const asset = normalizeTicker(review?.asset);

    if (asset && !reviewsByAsset.has(asset)) {
      reviewsByAsset.set(asset, review);
    }
  }

  return reviewsByAsset;
}

export function getDecisionReviewByAsset(asset) {
  const cleanTicker = normalizeTicker(asset);
  return cleanTicker ? indexDecisionReviewsByAsset().get(cleanTicker) || null : null;
}

export function saveDecisionReview(review) {
  const normalizedStatus = normalizeReviewStatus(review?.status);
  const now = buildTimestamp();

  return persistDecisionReview({
    id: String(review?.id || buildReviewId(review?.asset)),
    runId: String(review?.runId || ""),
    asset: normalizeTicker(review?.asset),
    action: String(review?.action || "HOLD"),
    confidence: Number.isFinite(Number(review?.confidence)) ? Number(review.confidence) : 0,
    summary: String(review?.summary || ""),
    note: normalizedStatus === "proposed" ? "" : String(review?.note || "").trim(),
    status: normalizedStatus,
    createdAt: String(review?.createdAt || now),
    updatedAt: String(review?.updatedAt || now),
    reviewedAt:
      normalizedStatus === "proposed"
        ? ""
        : String(review?.reviewedAt || review?.updatedAt || now),
    decisionId: String(review?.decisionId || ""),
    decisionFingerprint: String(review?.decisionFingerprint || ""),
    horizon: String(review?.horizon || ""),
    clusterIds: Array.isArray(review?.clusterIds) ? review.clusterIds : [],
    vetoed: Boolean(review?.vetoed),
    vetoReason: String(review?.vetoReason || ""),
    rationale: Array.isArray(review?.rationale) ? review.rationale : [],
    whyNot: Array.isArray(review?.whyNot) ? review.whyNot : [],
    uncertainty: Array.isArray(review?.uncertainty) ? review.uncertainty : [],
    marketContext: review?.marketContext || null,
    active: review?.active !== false,
    lastSeenAt: String(review?.lastSeenAt || review?.updatedAt || now),
    previousStatus: String(review?.previousStatus || ""),
    previousDecisionId: String(review?.previousDecisionId || ""),
    carriedForwardFromDecisionId: String(review?.carriedForwardFromDecisionId || "")
  });
}

function syncDecisionReview(snapshot, decision, existingReview) {
  const now = buildTimestamp();
  const decisionId = buildDecisionId(snapshot.runId, decision.asset);
  const decisionFingerprint = buildDecisionFingerprint(decision);
  const isSameDecision = existingReview?.decisionFingerprint === decisionFingerprint;
  const shouldCarryForward =
    isSameDecision && existingReview?.decisionId && existingReview.decisionId !== decisionId;

  return saveDecisionReview({
    id: existingReview?.id || buildReviewId(decision.asset),
    runId: snapshot.runId,
    asset: decision.asset,
    action: decision.action,
    confidence: decision.confidence,
    summary: decision.rationale?.[0] || "",
    note: isSameDecision ? existingReview?.note || "" : "",
    status: isSameDecision ? existingReview?.status || "proposed" : "proposed",
    updatedAt: isSameDecision ? existingReview?.updatedAt || now : now,
    reviewedAt: isSameDecision ? existingReview?.reviewedAt || "" : "",
    decisionId,
    decisionFingerprint,
    horizon: decision.horizon,
    clusterIds: decision.clusterIds || [],
    vetoed: decision.vetoed,
    vetoReason: decision.vetoReason,
    rationale: decision.rationale || [],
    whyNot: decision.whyNot || [],
    uncertainty: decision.uncertainty || [],
    marketContext: decision.marketContext || null,
    active: true,
    lastSeenAt: snapshot.generatedAt || now,
    previousStatus: isSameDecision ? existingReview?.previousStatus || "" : existingReview?.status || "",
    previousDecisionId: isSameDecision
      ? existingReview?.previousDecisionId || ""
      : existingReview?.decisionId || "",
    carriedForwardFromDecisionId: shouldCarryForward ? existingReview.decisionId : ""
  });
}

function markDecisionReviewInactive(review, snapshotGeneratedAt) {
  if (!review || review.active === false) {
    return review || null;
  }

  return saveDecisionReview({
    ...review,
    active: false,
    lastSeenAt: snapshotGeneratedAt || buildTimestamp(),
    carriedForwardFromDecisionId: ""
  });
}

function syncDecisionReviewsForSnapshot(snapshot) {
  if (!snapshot?.runId) {
    return indexDecisionReviewsByAsset();
  }

  const reviewsByAsset = indexDecisionReviewsByAsset();
  const activeAssets = new Set();
  const currentDecisions = (snapshot.appData?.decisions || []).filter(decisionNeedsReview);

  for (const decision of currentDecisions) {
    const asset = normalizeTicker(decision.asset);

    if (!asset) {
      continue;
    }

    activeAssets.add(asset);
    syncDecisionReview(snapshot, decision, reviewsByAsset.get(asset));
  }

  for (const [asset, review] of reviewsByAsset.entries()) {
    if (!activeAssets.has(asset)) {
      markDecisionReviewInactive(review, snapshot.generatedAt);
    }
  }

  return indexDecisionReviewsByAsset();
}

export function updateDecisionReviewStatus({ reviewId, status, note = "" } = {}) {
  const normalizedStatus = normalizeReviewStatus(status);
  const review =
    getDecisionReview(reviewId) ||
    indexDecisionReviewsByAsset().get(normalizeTicker(reviewId)) ||
    listDecisionReviews().find((entry) => entry.decisionId === reviewId);

  if (!review) {
    throw new Error("Decision review not found.");
  }

  const now = buildTimestamp();

  return saveDecisionReview({
    ...review,
    status: normalizedStatus,
    note: normalizedStatus === "proposed" ? "" : note || review.note || "",
    updatedAt: now,
    reviewedAt: normalizedStatus === "proposed" ? "" : now,
    active: true
  });
}

export function decorateDecisionHistoryWithReviews(entries, reviewMap = null) {
  const reviewsByAsset = reviewMap instanceof Map ? reviewMap : indexDecisionReviewsByAsset();

  return entries.map((entry) => {
    const review = reviewsByAsset.get(normalizeTicker(entry.asset));
    const matchesCurrentDecision = review?.decisionId === entry.id;

    return {
      ...entry,
      reviewStatus: matchesCurrentDecision ? review?.status || "" : "",
      reviewNote: matchesCurrentDecision ? review?.note || "" : "",
      reviewUpdatedAt: matchesCurrentDecision ? review?.updatedAt || "" : "",
      reviewedAt: matchesCurrentDecision ? review?.reviewedAt || "" : ""
    };
  });
}

export function buildCurrentDecisionReviewState({
  snapshot,
  financialProfile = {},
  reviewMap = null
}) {
  const reviewsByAsset = reviewMap instanceof Map ? reviewMap : syncDecisionReviewsForSnapshot(snapshot);
  const decisions = (snapshot?.appData?.decisions || []).filter(decisionNeedsReview);
  const posts = snapshot?.appData?.posts || [];
  const trackedTickers = getTrackedTickers(financialProfile);
  const current = decisions
    .map((decision) =>
      buildReviewItem(
        decision,
        snapshot,
        posts,
        trackedTickers,
        reviewsByAsset.get(normalizeTicker(decision.asset))
      )
    )
    .sort(sortReviewItems);
  const queue = trackedTickers.length ? current.filter((item) => item.tracked) : current;
  const visibleQueue = queue.length ? queue : current;

  return {
    summary: buildReviewSummary(visibleQueue),
    queue: visibleQueue,
    current
  };
}

export function syncDecisionReviewsForRun({ run } = {}) {
  if (!run?.snapshot) {
    return [];
  }

  const reviewState = buildCurrentDecisionReviewState({
    snapshot: run.snapshot,
    financialProfile: {}
  });

  return reviewState.current.filter((item) => item.reviewStatus === "proposed");
}
