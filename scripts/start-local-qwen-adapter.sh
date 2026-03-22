#!/usr/bin/env bash
set -euo pipefail

export LOCAL_QWEN_MODEL_PATH="${LOCAL_QWEN_MODEL_PATH:-mlx-community/Qwen3-4B-4bit}"
export LOCAL_LLM_MODEL="${LOCAL_LLM_MODEL:-qwen3-4b-local}"
export LOCAL_LLM_ENABLE_THINKING="${LOCAL_LLM_ENABLE_THINKING:-0}"
export LOCAL_LLM_MAX_TOKENS="${LOCAL_LLM_MAX_TOKENS:-900}"

python -m uvicorn local_llm_adapter.main:app --host 127.0.0.1 --port "${LOCAL_LLM_PORT:-8001}"
