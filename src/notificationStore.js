import { getDatabase, parseJsonColumn } from "./database.js";

const NOTIFICATION_LIMIT = 160;

function buildNotificationId() {
  return `notification-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseNotificationRow(row) {
  return parseJsonColumn(row.payload, null);
}

function trimNotifications() {
  const db = getDatabase();
  const staleRows = db
    .prepare(
      `
        SELECT id
        FROM notification_events
        ORDER BY created_at DESC
        LIMIT -1 OFFSET ?
      `
    )
    .all(NOTIFICATION_LIMIT);

  if (!staleRows.length) {
    return;
  }

  const deleteStatement = db.prepare("DELETE FROM notification_events WHERE id = ?");

  for (const row of staleRows) {
    deleteStatement.run(row.id);
  }
}

function persistNotification(event) {
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO notification_events(
        id,
        channel,
        event_type,
        status,
        created_at,
        sent_at,
        error_message,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        channel = excluded.channel,
        event_type = excluded.event_type,
        status = excluded.status,
        created_at = excluded.created_at,
        sent_at = excluded.sent_at,
        error_message = excluded.error_message,
        payload = excluded.payload
    `
  ).run(
    event.id,
    event.channel,
    event.eventType,
    event.status,
    event.createdAt,
    event.sentAt || null,
    event.errorMessage || "",
    JSON.stringify(event)
  );

  trimNotifications();
  return event;
}

export function createNotificationEvent({ channel, eventType, payload }) {
  return persistNotification({
    id: buildNotificationId(),
    channel,
    eventType,
    status: "queued",
    createdAt: new Date().toISOString(),
    sentAt: "",
    errorMessage: "",
    payload
  });
}

export function markNotificationDelivered(eventId, patch = {}) {
  const event = getNotificationEvent(eventId);

  if (!event) {
    return null;
  }

  return persistNotification({
    ...event,
    ...patch,
    status: patch.status || "sent",
    sentAt: patch.sentAt || new Date().toISOString(),
    errorMessage: ""
  });
}

export function markNotificationFailed(eventId, error, patch = {}) {
  const event = getNotificationEvent(eventId);

  if (!event) {
    return null;
  }

  return persistNotification({
    ...event,
    ...patch,
    status: "failed",
    sentAt: "",
    errorMessage: error instanceof Error ? error.message : String(error || "Notification failed.")
  });
}

export function listNotificationEvents(limit = NOTIFICATION_LIMIT) {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT payload
        FROM notification_events
        ORDER BY created_at DESC
        LIMIT ?
      `
    )
    .all(limit);

  return rows.map((row) => parseNotificationRow(row)).filter(Boolean);
}

export function getNotificationEvent(eventId) {
  const db = getDatabase();
  const row = db.prepare("SELECT payload FROM notification_events WHERE id = ?").get(eventId);
  return row ? parseNotificationRow(row) : null;
}
