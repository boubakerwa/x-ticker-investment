import { getDatabase, parseJsonColumn } from "./database.js";

const ANSWER_LIMIT = 40;

function buildAnswerId() {
  return `advisor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function trimAnswers() {
  const db = getDatabase();
  const staleRows = db
    .prepare(
      `
        SELECT id
        FROM advisor_answers
        ORDER BY created_at DESC
        LIMIT -1 OFFSET ?
      `
    )
    .all(ANSWER_LIMIT);

  if (!staleRows.length) {
    return;
  }

  const deleteStatement = db.prepare("DELETE FROM advisor_answers WHERE id = ?");

  for (const row of staleRows) {
    deleteStatement.run(row.id);
  }
}

export function listAdvisorAnswers(limit = ANSWER_LIMIT) {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM advisor_answers
        ORDER BY created_at DESC
        LIMIT ?
      `
    )
    .all(limit);

  return rows.map((row) => parseJsonColumn(row.payload, null)).filter(Boolean);
}

export function persistAdvisorAnswer(answer) {
  const db = getDatabase();
  const id = answer.id || buildAnswerId();
  const nextAnswer = {
    ...answer,
    id,
    createdAt: answer.createdAt || new Date().toISOString()
  };

  db.prepare(
    `
      INSERT INTO advisor_answers(id, created_at, asset_ticker, status, payload)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        created_at = excluded.created_at,
        asset_ticker = excluded.asset_ticker,
        status = excluded.status,
        payload = excluded.payload
    `
  ).run(
    nextAnswer.id,
    nextAnswer.createdAt,
    nextAnswer.assetTicker,
    nextAnswer.status,
    JSON.stringify(nextAnswer)
  );

  trimAnswers();
  return nextAnswer;
}
