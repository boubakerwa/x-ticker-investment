import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from functools import lru_cache
from threading import Lock
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

try:
    from mlx_lm import generate, load
except ImportError:  # pragma: no cover - optional runtime dependency
    generate = None
    load = None


app = FastAPI(title="Local OpenAI-compatible Qwen adapter")

logger = logging.getLogger("local_llm_adapter")
logger.setLevel(getattr(logging, os.getenv("LOCAL_LLM_LOG_LEVEL", "INFO").upper(), logging.INFO))

if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[local-llm] %(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)

logger.propagate = False

_status_lock = Lock()
_runtime_status = {
    "process_started_at": "",
    "model_loaded": False,
    "model_loaded_at": "",
    "model_load_duration_ms": 0,
    "active_requests": 0,
    "completed_requests": 0,
    "failed_requests": 0,
    "last_request_id": "",
    "last_request_model": "",
    "last_request_started_at": "",
    "last_request_finished_at": "",
    "last_request_duration_ms": 0,
    "last_prompt_chars": 0,
    "last_output_chars": 0,
    "last_error": "",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _update_status(**values: Any) -> None:
    with _status_lock:
        _runtime_status.update(values)


def _snapshot_status() -> dict[str, Any]:
    with _status_lock:
        snapshot = dict(_runtime_status)

    return {
        **snapshot,
        "ok": True,
        "provider": "mlx-lm",
        "model_path": os.getenv("LOCAL_QWEN_MODEL_PATH", "mlx-community/Qwen3-4B-4bit"),
        "configured_model_id": os.getenv("LOCAL_LLM_MODEL", "qwen3-4b-local"),
        "thinking_enabled": os.getenv("LOCAL_LLM_ENABLE_THINKING", "0") == "1",
        "max_tokens": int(os.getenv("LOCAL_LLM_MAX_TOKENS", "900")),
        "verbose_generation": os.getenv("LOCAL_LLM_VERBOSE", "0") == "1",
    }


def _mark_request_started(request_id: str, model: str, prompt_chars: int) -> None:
    with _status_lock:
        _runtime_status["active_requests"] += 1
        _runtime_status["last_request_id"] = request_id
        _runtime_status["last_request_model"] = model
        _runtime_status["last_request_started_at"] = _now_iso()
        _runtime_status["last_request_finished_at"] = ""
        _runtime_status["last_request_duration_ms"] = 0
        _runtime_status["last_prompt_chars"] = prompt_chars
        _runtime_status["last_output_chars"] = 0
        _runtime_status["last_error"] = ""


def _mark_request_finished(
    request_id: str,
    started_at: float,
    output_chars: int = 0,
    error: str = "",
) -> None:
    with _status_lock:
        _runtime_status["active_requests"] = max(0, _runtime_status["active_requests"] - 1)
        _runtime_status["last_request_id"] = request_id
        _runtime_status["last_request_finished_at"] = _now_iso()
        _runtime_status["last_request_duration_ms"] = int((time.time() - started_at) * 1000)
        _runtime_status["last_output_chars"] = output_chars
        _runtime_status["last_error"] = error

        if error:
            _runtime_status["failed_requests"] += 1
        else:
            _runtime_status["completed_requests"] += 1


_update_status(process_started_at=_now_iso())


class ResponseFormat(BaseModel):
    type: str = "json_schema"
    name: str
    strict: bool = True
    schema: dict[str, Any]


class TextFormat(BaseModel):
    format: ResponseFormat


class InputContent(BaseModel):
    type: str
    text: str


class InputMessage(BaseModel):
    role: str
    content: list[InputContent]


class ResponsesRequest(BaseModel):
    model: str
    store: bool = False
    instructions: str
    input: list[InputMessage]
    text: TextFormat


def _strip_thinking(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _flatten_input(messages: list[InputMessage]) -> str:
    chunks: list[str] = []

    for message in messages:
        for content in message.content:
            if content.type == "input_text" and content.text.strip():
                chunks.append(content.text.strip())

    return "\n\n".join(chunks).strip()


def _build_prompt(payload: ResponsesRequest) -> str:
    enable_thinking = os.getenv("LOCAL_LLM_ENABLE_THINKING", "0") == "1"
    thinking_instruction = (
        "Use non-thinking mode and do not emit hidden reasoning."
        if not enable_thinking
        else "Thinking mode is allowed, but the final output must still be valid JSON only."
    )

    return "\n\n".join(
        [
            payload.instructions.strip(),
            thinking_instruction,
            "Return JSON only. Do not use markdown fences.",
            f"Schema name: {payload.text.format.name}",
            f"JSON schema:\n{json.dumps(payload.text.format.schema, indent=2)}",
            "User payload:",
            _flatten_input(payload.input),
        ]
    )


@lru_cache(maxsize=1)
def _load_model():
    if load is None or generate is None:  # pragma: no cover - optional runtime dependency
        _update_status(last_error="mlx-lm is not installed.")
        raise RuntimeError(
            "mlx-lm is not installed. Install the adapter requirements on the Mac Mini first."
        )

    model_path = os.getenv("LOCAL_QWEN_MODEL_PATH", "mlx-community/Qwen3-4B-4bit")
    started_at = time.time()
    logger.info("model_load_start model_path=%s", model_path)

    try:
        model_tuple = load(model_path)
    except Exception as error:  # pragma: no cover - runtime-only branch
        _update_status(last_error=str(error))
        logger.exception("model_load_failed model_path=%s", model_path)
        raise

    duration_ms = int((time.time() - started_at) * 1000)
    _update_status(
        model_loaded=True,
        model_loaded_at=_now_iso(),
        model_load_duration_ms=duration_ms,
        last_error="",
    )
    logger.info("model_load_done model_path=%s duration_ms=%s", model_path, duration_ms)
    return model_tuple


@app.get("/health")
def health():
    snapshot = _snapshot_status()
    return {
        "ok": True,
        "provider": snapshot["provider"],
        "model_path": snapshot["model_path"],
        "model_loaded": snapshot["model_loaded"],
        "active_requests": snapshot["active_requests"],
        "last_error": snapshot["last_error"],
    }


@app.get("/status")
@app.get("/v1/status")
def status():
    return _snapshot_status()


@app.get("/v1/models")
def models():
    return {
        "object": "list",
        "data": [
            {
                "id": os.getenv("LOCAL_LLM_MODEL", "qwen3-4b-local"),
                "object": "model",
                "owned_by": "local",
            }
        ],
    }


@app.post("/v1/responses")
def responses(payload: ResponsesRequest):
    request_id = f"resp_{int(time.time() * 1000)}"
    started_at = time.time()
    prompt = _build_prompt(payload)
    prompt_chars = len(prompt)
    verbose_generation = os.getenv("LOCAL_LLM_VERBOSE", "0") == "1"

    _mark_request_started(request_id, payload.model, prompt_chars)
    logger.info(
        "request_start id=%s model=%s prompt_chars=%s max_tokens=%s thinking=%s",
        request_id,
        payload.model,
        prompt_chars,
        os.getenv("LOCAL_LLM_MAX_TOKENS", "900"),
        os.getenv("LOCAL_LLM_ENABLE_THINKING", "0"),
    )

    try:
        model, tokenizer = _load_model()
    except RuntimeError as error:  # pragma: no cover - runtime-only branch
        _mark_request_finished(request_id, started_at, error=str(error))
        raise HTTPException(status_code=500, detail=str(error)) from error

    try:
        raw_output = generate(
            model,
            tokenizer,
            prompt=prompt,
            verbose=verbose_generation,
            max_tokens=int(os.getenv("LOCAL_LLM_MAX_TOKENS", "900")),
        )
    except Exception as error:  # pragma: no cover - runtime-only branch
        _mark_request_finished(request_id, started_at, error=f"Local generation failed: {error}")
        logger.exception("request_failed id=%s model=%s", request_id, payload.model)
        raise HTTPException(status_code=500, detail=f"Local generation failed: {error}") from error

    text = _strip_thinking(raw_output).strip()
    _mark_request_finished(request_id, started_at, output_chars=len(text))
    logger.info(
        "request_done id=%s model=%s duration_ms=%s output_chars=%s",
        request_id,
        payload.model,
        _snapshot_status()["last_request_duration_ms"],
        len(text),
    )

    return {
        "id": request_id,
        "object": "response",
        "created_at": int(time.time()),
        "model": payload.model,
        "output_text": text,
        "output": [
            {
                "id": f"msg_{int(time.time() * 1000)}",
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": text,
                    }
                ],
            }
        ],
    }
