# Roadmap Checklist

## Done

- [x] Build the web app shell from the PRD
- [x] Add a seeded fake tweet feed and fetch it through the local API
- [x] Add the analysed-tweets landing-page window
- [x] Move the decision framework to a dedicated docs page
- [x] Keep source CRUD in the Operator page
- [x] Add the server-side agent engine for claims, clusters, policy, and decisions
- [x] Add extraction replay tooling for prompt and cache inspection
- [x] Add an offline extraction eval harness
- [x] Persist engine runs, eval runs, and decision history
- [x] Move the engine off request-time-only execution into a persisted pipeline runner
- [x] Add raw-ingestion contracts with dedupe and source watermarks
- [x] Add market-context enrichment to the decision engine
- [x] Replace JSON-first persistence with SQLite as the primary data store
- [x] Add a background pipeline scheduler
- [x] Add regression gates for eval runs
- [x] Add decision outcome tracking with reference prices and later-run updates
- [x] Add provider adapters for fake feed, market data, and future live integrations

## Partially Done

- [ ] Live market data is available through the Stooq adapter, but we still keep mock fallback and have not hardened multi-provider production operations yet
- [ ] The X provider adapter is scaffolded, but live ingestion is not wired because credentials are not configured yet
- [ ] The OpenAI extraction path is implemented, cached, and replayable, but it has not been validated live in this workspace because no API key is configured yet

## Left

- [ ] Wire the real X ingestion adapter end to end with credentials, watermarks, and fetch scheduling
- [ ] Run live OpenAI extraction in production mode and tune the prompt/schema against real outputs
- [ ] Expand the eval suite with harder ambiguous cases and cluster/decision-level assertions
- [ ] Add richer run-history analytics and outcome reporting in the UI
- [ ] Decide when to retire the legacy JSON compatibility files after SQLite has proven stable
