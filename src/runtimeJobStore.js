import { getDatabase, parseJsonColumn } from "./database.js";

const JOB_LIMIT = 120;

function buildTimestamp() {
  return new Date().toISOString();
}

function buildJobId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseJobRow(row) {
  return parseJsonColumn(row.payload, null);
}

function trimJobs() {
  const db = getDatabase();
  const staleRows = db
    .prepare(
      `
        SELECT id
        FROM runtime_jobs
        ORDER BY requested_at DESC
        LIMIT -1 OFFSET ?
      `
    )
    .all(JOB_LIMIT);

  if (!staleRows.length) {
    return;
  }

  const deleteStatement = db.prepare("DELETE FROM runtime_jobs WHERE id = ?");

  for (const row of staleRows) {
    deleteStatement.run(row.id);
  }
}

function persistJob(job) {
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO runtime_jobs(
        id,
        type,
        status,
        trigger,
        requested_at,
        started_at,
        finished_at,
        related_run_id,
        error_message,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        status = excluded.status,
        trigger = excluded.trigger,
        requested_at = excluded.requested_at,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        related_run_id = excluded.related_run_id,
        error_message = excluded.error_message,
        payload = excluded.payload
    `
  ).run(
    job.id,
    job.type,
    job.status,
    job.trigger,
    job.requestedAt,
    job.startedAt || null,
    job.finishedAt || null,
    job.relatedRunId || null,
    job.errorMessage || "",
    JSON.stringify(job)
  );

  trimJobs();
  return job;
}

export function createRuntimeJob({ type, trigger = "manual", input = {}, meta = {} }) {
  const job = {
    id: buildJobId(),
    type,
    status: "queued",
    trigger,
    requestedAt: buildTimestamp(),
    startedAt: "",
    finishedAt: "",
    relatedRunId: "",
    errorMessage: "",
    input,
    output: null,
    meta
  };

  return persistJob(job);
}

export function markRuntimeJobRunning(jobId, patch = {}) {
  const job = getRuntimeJob(jobId);

  if (!job) {
    return null;
  }

  return persistJob({
    ...job,
    ...patch,
    status: "running",
    startedAt: patch.startedAt || buildTimestamp(),
    finishedAt: "",
    errorMessage: ""
  });
}

export function markRuntimeJobCompleted(jobId, patch = {}) {
  const job = getRuntimeJob(jobId);

  if (!job) {
    return null;
  }

  return persistJob({
    ...job,
    ...patch,
    status: "completed",
    finishedAt: patch.finishedAt || buildTimestamp(),
    errorMessage: patch.errorMessage || ""
  });
}

export function markRuntimeJobFailed(jobId, error, patch = {}) {
  const job = getRuntimeJob(jobId);

  if (!job) {
    return null;
  }

  return persistJob({
    ...job,
    ...patch,
    status: "failed",
    finishedAt: patch.finishedAt || buildTimestamp(),
    errorMessage: error instanceof Error ? error.message : String(error || "Runtime job failed.")
  });
}

export function listRuntimeJobs(limit = JOB_LIMIT) {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM runtime_jobs
        ORDER BY requested_at DESC
        LIMIT ?
      `
    )
    .all(limit);

  return rows.map((row) => parseJobRow(row)).filter(Boolean);
}

export function getRuntimeJob(jobId) {
  const db = getDatabase();
  const row = db.prepare("SELECT payload FROM runtime_jobs WHERE id = ?").get(jobId);
  return row ? parseJobRow(row) : null;
}

export function getLatestRuntimeJob(type = "") {
  const db = getDatabase();
  const row = type
    ? db
        .prepare(
          `
            SELECT payload
            FROM runtime_jobs
            WHERE type = ?
            ORDER BY requested_at DESC
            LIMIT 1
          `
        )
        .get(type)
    : db
        .prepare(
          `
            SELECT payload
            FROM runtime_jobs
            ORDER BY requested_at DESC
            LIMIT 1
          `
        )
        .get();

  return row ? parseJobRow(row) : null;
}

export function getActiveRuntimeJob(type = "") {
  const db = getDatabase();
  const row = type
    ? db
        .prepare(
          `
            SELECT payload
            FROM runtime_jobs
            WHERE type = ?
              AND status IN ('queued', 'running')
            ORDER BY requested_at DESC
            LIMIT 1
          `
        )
        .get(type)
    : db
        .prepare(
          `
            SELECT payload
            FROM runtime_jobs
            WHERE status IN ('queued', 'running')
            ORDER BY requested_at DESC
            LIMIT 1
          `
        )
        .get();

  return row ? parseJobRow(row) : null;
}
