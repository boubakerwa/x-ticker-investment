import { getDatabase, parseJsonColumn } from "./database.js";

const DRAFT_LIMIT = 80;

function buildDraftId() {
  return `linkedin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function trimDrafts() {
  const db = getDatabase();
  const staleRows = db
    .prepare(
      `
        SELECT id
        FROM linkedin_drafts
        ORDER BY created_at DESC
        LIMIT -1 OFFSET ?
      `
    )
    .all(DRAFT_LIMIT);

  if (!staleRows.length) {
    return;
  }

  const deleteStatement = db.prepare("DELETE FROM linkedin_drafts WHERE id = ?");

  for (const row of staleRows) {
    deleteStatement.run(row.id);
  }
}

export function listLinkedinDrafts(limit = DRAFT_LIMIT) {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM linkedin_drafts
        ORDER BY created_at DESC
        LIMIT ?
      `
    )
    .all(limit);

  return rows.map((row) => parseJsonColumn(row.payload, null)).filter(Boolean);
}

export function getLinkedinDraft(draftId) {
  const normalizedDraftId = String(draftId || "").trim();

  if (!normalizedDraftId) {
    return null;
  }

  const row = getDatabase()
    .prepare(
      `
        SELECT payload
        FROM linkedin_drafts
        WHERE id = ?
      `
    )
    .get(normalizedDraftId);

  return row ? parseJsonColumn(row.payload, null) : null;
}

export function getLatestLinkedinDraft() {
  return listLinkedinDrafts(1)[0] || null;
}

export function persistLinkedinDraft(draft) {
  const db = getDatabase();
  const id = String(draft?.id || buildDraftId()).trim();
  const createdAt = String(draft?.createdAt || new Date().toISOString()).trim();
  const nextDraft = {
    ...draft,
    id,
    createdAt,
    updatedAt: String(draft?.updatedAt || createdAt).trim()
  };
  const nextLibrary = {
    ...(draft?.library || {}),
    rootDraftId: String(draft?.library?.rootDraftId || id).trim() || id,
    parentDraftId: String(draft?.library?.parentDraftId || "").trim()
  };
  nextDraft.library = nextLibrary;

  db.prepare(
    `
      INSERT INTO linkedin_drafts(id, created_at, updated_at, source_type, status, payload)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        source_type = excluded.source_type,
        status = excluded.status,
        payload = excluded.payload
    `
  ).run(
    nextDraft.id,
    nextDraft.createdAt,
    nextDraft.updatedAt,
    String(nextDraft?.source?.type || "manual"),
    String(nextDraft?.status || "ready"),
    JSON.stringify(nextDraft)
  );

  trimDrafts();
  return nextDraft;
}
