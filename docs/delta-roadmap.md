# Delta Roadmap

This roadmap now reflects what is already shipped in the repo and what still looks like the highest-leverage next work.

## Current Product Shape

The app is no longer just a signal dashboard with explainable `BUY` / `HOLD` / `SELL` calls.

It is now a bounded operator desk with:

- persisted pipeline runs and evals
- background orchestration and optional notifications
- portfolio-aware advisor flows
- an operator approval queue
- a research dossier lifecycle with validation and thesis approval gates
- conservative decision math on candidate calls

## What Is Already Shipped

### Runtime and orchestration

- persisted runtime jobs
- orchestrated pipeline execution
- daily digest and notification plumbing
- scheduler controls and runtime visibility

### Operator context

- financial profile persistence
- guided onboarding
- holdings / liabilities / watchlist capture
- advisor history and replay

### Decision governance

- proposed / approved / dismissed decision review state
- carry-forward review persistence across runs
- queue visibility in the app

### Research-first workflow

- SQLite-backed research dossier store
- canonical dossier lifecycle:
  `discovery -> candidate -> validated -> approved / dismissed / expired / archived`
- validation requirements before a thesis can be promoted
- research exposure in `/api/app-data`
- operator CRUD for dossiers
- queue gating so non-validated theses do not surface as approval candidates
- linked research visibility from Overview, Assets, and Advisor

### Decision quality improvements

- explicit decision math:
  thesis probability, uncertainty, expected upside, expected downside, reward-to-risk, size band, max-loss guardrail
- conservative advisor fallback when governance is incomplete

## Recommended Next Priorities

### 1. Deeper scorecards

The repo now has dossier and scorecard scaffolding. The next step is to make those scorecards more empirical and decision-useful.

Recommended additions:

- per-source outcome quality
- per-theme hit-rate tracking
- freshness decay curves
- contradiction frequency and source disagreement analytics

### 2. Stronger evidence adapters

The market layer still leans on price and regime context. The next improvement should broaden thesis verification.

Recommended additions:

- earnings and guidance adapters
- macro / event calendar adapters
- sector breadth and leadership metrics
- optional niche evidence adapters for specific themes

### 3. Usefulness evals beyond extraction

Extraction evals are already helpful, but the next tier should test whether the product is useful end to end.

Recommended additions:

- decision usefulness evals
- confidence calibration vs realized outcomes
- thesis lifecycle progression quality
- advisor governance regression tests

### 4. Regime adaptation

The decision policy is explainable and conservative, but still mostly static.

Recommended additions:

- threshold shifts in high-volatility regimes
- stronger downgrade logic under source disagreement
- concentration-aware policy tuning
- narrative staleness penalties

### 5. Postmortem and learning loops

The lifecycle now has explicit structure. The next step is to make thesis invalidation and learning more visible.

Recommended additions:

- postmortem templates
- thesis invalidation logs
- archived / dismissed dossier review analytics
- “what changed?” summaries between runs

## Guiding Rule

The repo should keep moving toward stronger research, stronger math, and stronger operator governance without losing:

- bounded behavior
- explainability
- replayability
- local-first usability
- human approval before anything feels action-ready
