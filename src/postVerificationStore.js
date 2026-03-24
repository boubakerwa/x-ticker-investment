import { getDatabase, parseJsonColumn } from "./database.js";

function buildTimestamp() {
  return new Date().toISOString();
}

function normalizePostId(value) {
  return String(value || "").trim();
}

function normalizeOverride(payload = {}, fallback = {}) {
  const postId = normalizePostId(payload.postId || fallback.postId);

  if (!postId) {
    return null;
  }

  return {
    postId,
    enabled: payload.enabled !== false,
    note: String(payload.note || fallback.note || "").trim(),
    updatedAt: String(payload.updatedAt || fallback.updatedAt || buildTimestamp()).trim()
  };
}

function parseOverrideRow(row) {
  const parsed = parseJsonColumn(row?.payload, null);
  return normalizeOverride(parsed, {
    postId: row?.post_id,
    updatedAt: row?.updated_at
  });
}

export function readPostVerificationOverrides() {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT post_id, updated_at, payload
        FROM post_verification_overrides
        ORDER BY updated_at DESC
      `
    )
    .all();

  const overrides = rows.map((row) => parseOverrideRow(row)).filter(Boolean);

  return {
    overrides,
    byPostId: Object.fromEntries(overrides.map((override) => [override.postId, override]))
  };
}

export function getPostVerificationOverride(postId) {
  const normalizedPostId = normalizePostId(postId);

  if (!normalizedPostId) {
    return null;
  }

  const db = getDatabase();
  const row = db
    .prepare(
      `
        SELECT post_id, updated_at, payload
        FROM post_verification_overrides
        WHERE post_id = ?
      `
    )
    .get(normalizedPostId);

  return row ? parseOverrideRow(row) : null;
}

export function setPostVerificationOverride({ postId, enabled = true, note = "" }) {
  const normalizedPostId = normalizePostId(postId);

  if (!normalizedPostId) {
    throw new Error("postId is required.");
  }

  const db = getDatabase();

  if (!enabled) {
    db.prepare(
      `
        DELETE FROM post_verification_overrides
        WHERE post_id = ?
      `
    ).run(normalizedPostId);

    return null;
  }

  const override = normalizeOverride({
    postId: normalizedPostId,
    enabled: true,
    note,
    updatedAt: buildTimestamp()
  });

  db.prepare(
    `
      INSERT INTO post_verification_overrides(post_id, updated_at, payload)
      VALUES (?, ?, ?)
      ON CONFLICT(post_id) DO UPDATE SET
        updated_at = excluded.updated_at,
        payload = excluded.payload
    `
  ).run(override.postId, override.updatedAt, JSON.stringify(override));

  return override;
}
