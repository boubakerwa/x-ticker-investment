# Single-User Setup Guide

This guide covers the manual steps you need to complete on your side to turn the app into a practical single-user workflow.

## What is already implemented in the app

- a structured `Portfolio` setup flow for entering holdings, cash context, liabilities, pensions, and insurance products
- a manual `Signals` inbox that lets you paste real posts, links, or notes and immediately rerun the pipeline
- a portfolio-first `Overview` page driven by your saved holdings and watchlist
- a focused `Advisor` workspace for questions once your profile is in place
- Telegram-ready daily digests and pipeline alerts

## Local quickstart

1. Copy the example env file and create your real local config:

```bash
cp .env.example .env
```

2. Start the app:

```bash
npm start
```

3. Open the app and complete the `Portfolio` tab:
- `Profile`: add your name, investing horizon, goals, and a small watchlist
- `Cash & Cover`: add monthly income, expenses, emergency fund, liabilities, and any long-term products such as private `Rentenversicherung`, `bAV`, or insurance wrappers
- `Assets`: add the holdings you actually own through the form UI
- save the portfolio

4. Go to `Signals` and paste a few real posts or notes into the manual feed form.

5. Run the pipeline, then return to `Overview` to review the queue.

## Manual X API setup

The code now expects a bearer-token-based X API v2 setup.

### From your side

1. Create or use an X developer account.
2. Create a Project and App in the X developer console.
3. Generate or copy the app bearer token.
4. Put the bearer token into `.env`:

```bash
FEED_PROVIDER=x-api
X_API_BEARER_TOKEN=your_bearer_token_here
X_API_BASE_URL=https://api.x.com/2
X_API_MAX_RESULTS_PER_SOURCE=8
```

5. Keep the source handles in the app’s source registry aligned with the real X usernames you want to monitor.
6. Restart the server after changing `.env`.
7. In the app, go to `Operations` and click `Run pipeline`.

### Notes

- the app resolves source handles against X usernames, then pulls recent posts from each user timeline
- if a source handle does not resolve, the pipeline will surface a warning
- if the bearer token is missing or invalid, the X sync will fail loudly instead of silently pretending the feed is live

## Manual Telegram setup

### From your side

1. Create a Telegram bot using `@BotFather`.
2. Copy the bot token.
3. Start a chat with the bot, or add it to the chat/channel you want to use.
4. Get the destination chat id.

Practical ways to get the chat id:
- send a message to the bot, then inspect `getUpdates`
- or use your preferred Telegram tooling to inspect the chat metadata

5. Add the Telegram config to `.env`:

```bash
NOTIFICATION_PROVIDER=telegram
NOTIFICATIONS_ENABLED=1
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
TELEGRAM_API_BASE_URL=https://api.telegram.org
```

6. Restart the server after changing `.env`.
7. In the app, go to `Operations` and click `Test notification`.
8. If that works, click `Send digest` to verify the daily digest format.

## Recommended first-use workflow

1. Complete the `Portfolio` tab with your real holdings, liabilities, and any pension or insurance products that matter for decision-making.
2. Use `Signals` to import a few real posts and validate the flow before trusting live X sync.
3. Enable the X API feed once the manual signal flow looks sensible.
4. Enable Telegram only after the digest content feels right.

## Optional local-model setup

If you want local inference instead of hosted OpenAI:

```bash
LLM_PROVIDER=local_openai_compatible
LOCAL_LLM_BASE_URL=http://127.0.0.1:8001/v1
LOCAL_LLM_API_KEY=local-dev-token
LOCAL_LLM_MODEL=qwen3-4b-local
OPENAI_MODEL=qwen3-4b-local
FINANCIAL_ADVISOR_MODEL=qwen3-4b-local
```

Then start the adapter:

```bash
./scripts/start-local-qwen-adapter.sh
```

Then validate the model before trusting it:

```bash
npm run evals:model
```

See `docs/local-qwen-macmini.md` for the full local-model notes.
