# Delta Roadmap: bounded market intelligence with Telegram notifications

## Goal

Evolve X Ticker Investment from a bounded recommendation engine into a stronger operator-facing runtime without losing the current strengths:

- explainability
- deterministic policy/veto layers
- replayability
- narrow scope
- human review before any future execution

## Phases

### Phase 1 — Orchestrator runtime

- Add explicit runtime jobs for pipeline refreshes and reports
- Persist job history for auditability
- Route scheduled/admin actions through one orchestration layer
- Expose job state through runtime APIs

### Phase 2 — Notification abstraction

- Add provider-based notifications
- Start with Telegram via environment variables
- Support daily digests, pipeline success/failure alerts, and operator test sends
- Keep notifications optional and safe when credentials are missing

### Phase 3 — Structured memory

- Add source, cluster, and regime memory summaries
- Keep memory advisory, not authoritative
- Feed memory into reports and ranking, not hidden policy changes

### Phase 4 — Approval queue

- Introduce explicit proposed/approved/dismissed decision states
- Require approval for ambiguous or high-impact recommendations
- Allow approvals in the app first, then optional Telegram action flow later

## Initial implementation in this branch

This branch executes the first part of the roadmap:

- runtime job persistence
- orchestrator wrapper for pipeline runs
- notification provider abstraction
- Telegram notification provider
- daily digest generation
- runtime/admin APIs for pause/resume/digest/test notification
- persisted financial profile capture for holdings, liabilities, and liquidity context
- portfolio-aware advisor questions grounded in the latest pipeline snapshot

## Telegram env variables

- `NOTIFICATION_PROVIDER=telegram`
- `NOTIFICATIONS_ENABLED=1`
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_CHAT_ID=...`
- `TELEGRAM_API_BASE_URL=https://api.telegram.org`

If credentials are missing, the runtime records notification events but marks them as skipped instead of failing the pipeline.
