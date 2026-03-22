# Single-User Setup Guide

This guide covers the manual steps you need to complete on your side to turn the app into a practical single-user workflow.

## What is already implemented in the app

- a manual inbox that lets you paste real posts, links, or notes and immediately rerun the pipeline
- a live X timeline adapter that can pull recent posts from the configured source handles once you provide an X bearer token
- a portfolio-first Today view driven by your saved holdings and watchlist
- quick holdings import from pasted CSV / TSV / semicolon exports
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

3. Open the app, go to `Advisor`, and do the minimum useful setup:
- add your holdings or paste a holdings export into the quick-import box
- add a small watchlist of names you care about
- save the profile

4. Go to `Operator` and either:
- paste manual posts into the Manual inbox, or
- finish the X API setup below and switch `FEED_PROVIDER` to `x-api`

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
7. In the app, go to `Operator` and click `Run pipeline`.

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
7. In the app, go to `Operator` and click `Test notification`.
8. If that works, click `Send digest` to verify the daily digest format.

## Recommended first-use workflow

1. Save your profile and watchlist.
2. Import a few real posts through the manual inbox to validate the flow before trusting the live X sync.
3. Enable the X API feed once the manual inbox results look sensible.
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

See `docs/local-qwen-macmini.md` for the full local-model notes.
