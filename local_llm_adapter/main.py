import json
import os
import re
import time
from functools import lru_cache
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

try:
    from mlx_lm import generate, load
except ImportError:  # pragma: no cover - optional runtime dependency
    generate = None
    load = None


app = FastAPI(title="Local OpenAI-compatible Qwen adapter")


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
        raise RuntimeError(
            "mlx-lm is not installed. Install the adapter requirements on the Mac Mini first."
        )

    model_path = os.getenv("LOCAL_QWEN_MODEL_PATH", "mlx-community/Qwen3-4B-4bit")
    return load(model_path)


@app.get("/health")
def health():
    return {
        "ok": True,
        "model_path": os.getenv("LOCAL_QWEN_MODEL_PATH", "mlx-community/Qwen3-4B-4bit"),
        "provider": "mlx-lm",
    }


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
    try:
        model, tokenizer = _load_model()
    except RuntimeError as error:  # pragma: no cover - runtime-only branch
        raise HTTPException(status_code=500, detail=str(error)) from error

    prompt = _build_prompt(payload)

    try:
        raw_output = generate(
            model,
            tokenizer,
            prompt=prompt,
            verbose=False,
            max_tokens=int(os.getenv("LOCAL_LLM_MAX_TOKENS", "900")),
        )
    except Exception as error:  # pragma: no cover - runtime-only branch
        raise HTTPException(status_code=500, detail=f"Local generation failed: {error}") from error

    text = _strip_thinking(raw_output).strip()

    return {
        "id": f"resp_{int(time.time() * 1000)}",
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
