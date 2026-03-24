import { getDatabase, parseJsonColumn } from "./database.js";

function buildTimestamp() {
  return new Date().toISOString();
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function normalizeCachedUser(input = {}, fallback = {}) {
  const handle = normalizeHandle(input.handle || input.username || fallback.handle);
  const userId = String(input.userId || input.id || fallback.userId || "").trim();

  if (!handle || !userId) {
    return null;
  }

  return {
    handle,
    userId,
    username: String(input.username || fallback.username || handle).trim(),
    name: String(input.name || fallback.name || "").trim(),
    verified: Boolean(input.verified ?? fallback.verified),
    mostRecentTweetId: String(
      input.mostRecentTweetId || input.most_recent_tweet_id || fallback.mostRecentTweetId || ""
    ).trim(),
    updatedAt: String(input.updatedAt || fallback.updatedAt || buildTimestamp()).trim()
  };
}

function parseCacheRow(row) {
  const parsed = parseJsonColumn(row?.payload, null);

  return normalizeCachedUser(parsed, {
    handle: row?.handle,
    userId: row?.user_id,
    updatedAt: row?.updated_at
  });
}

export function readXUserCacheByHandles(handles = []) {
  const normalizedHandles = [...new Set(handles.map((handle) => normalizeHandle(handle)).filter(Boolean))];

  if (!normalizedHandles.length) {
    return new Map();
  }

  const placeholders = normalizedHandles.map(() => "?").join(", ");
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT handle, user_id, updated_at, payload
        FROM x_user_cache
        WHERE handle IN (${placeholders})
      `
    )
    .all(...normalizedHandles);

  return new Map(
    rows
      .map((row) => parseCacheRow(row))
      .filter(Boolean)
      .map((entry) => [entry.handle, entry])
  );
}

export function upsertXUserCache(users = []) {
  const normalizedUsers = users.map((user) => normalizeCachedUser(user)).filter(Boolean);

  if (!normalizedUsers.length) {
    return [];
  }

  const db = getDatabase();
  const statement = db.prepare(
    `
      INSERT INTO x_user_cache(handle, user_id, updated_at, payload)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(handle) DO UPDATE SET
        user_id = excluded.user_id,
        updated_at = excluded.updated_at,
        payload = excluded.payload
    `
  );

  db.exec("BEGIN");

  try {
    for (const user of normalizedUsers) {
      statement.run(user.handle, user.userId, user.updatedAt, JSON.stringify(user));
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return normalizedUsers;
}
