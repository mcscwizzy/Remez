import os
import httpx
import json
import logging
from typing import Any

AZURE_AI_ENDPOINT = os.getenv(
    "AZURE_AI_ENDPOINT",
    "https://remez-dev-foundry-resource.openai.azure.com/openai/deployments/gpt-5-mini/chat/completions?api-version=2024-10-21",
)
AZURE_AI_DEPLOYMENT = os.getenv(
    "AZURE_AI_DEPLOYMENT",
    os.getenv("AZURE_AI_MODEL", "gpt-5-mini"),
)
AZURE_AI_API_KEY = os.getenv("AZURE_AI_API_KEY", "")
AZURE_AI_API_VERSION = os.getenv("AZURE_AI_API_VERSION", "2024-10-21")
LLM_HTTP_TIMEOUT_SEC = float(os.getenv("LLM_HTTP_TIMEOUT_SEC", "240"))
UPSTREAM_LOG_CHARS = int(os.getenv("UPSTREAM_LOG_CHARS", "1500"))
logger = logging.getLogger("remez")


class UpstreamModelContentError(Exception):
    def __init__(self, error: str, stage: str = "extract_model_text", details: str | None = None):
        super().__init__(error)
        self.error = error
        self.stage = stage
        self.details = details


def _truncate(value: str, limit: int = UPSTREAM_LOG_CHARS) -> str:
    if len(value) <= limit:
        return value
    return value[:limit] + "...[truncated]"


def _payload_shape(payload: Any) -> dict[str, Any]:
    shape: dict[str, Any] = {"payload_type": type(payload).__name__}
    if isinstance(payload, dict):
        shape["top_keys"] = sorted([str(k) for k in payload.keys()])[:20]
        choices = payload.get("choices")
        shape["choices_type"] = type(choices).__name__
        if isinstance(choices, list):
            shape["choices_len"] = len(choices)
            if choices and isinstance(choices[0], dict):
                message = choices[0].get("message")
                shape["message_type"] = type(message).__name__
                if isinstance(message, dict):
                    shape["message_keys"] = sorted([str(k) for k in message.keys()])[:20]
                    shape["content_type"] = type(message.get("content")).__name__
    return shape


def _part_text(part: Any) -> str:
    if isinstance(part, str):
        return part
    if not isinstance(part, dict):
        return ""

    text = part.get("text")
    if isinstance(text, str):
        return text
    if isinstance(text, dict):
        val = text.get("value")
        if isinstance(val, str):
            return val

    # Some providers may use "content" for textual blocks.
    content = part.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        val = content.get("value")
        if isinstance(val, str):
            return val

    return ""


def extract_text_from_response(payload: Any) -> str:
    shape = _payload_shape(payload)
    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not isinstance(choices, list) or not choices:
        logger.error("extract_model_text_failed", extra={"reason": "missing_choices", "shape": shape})
        raise UpstreamModelContentError(
            error="Upstream model returned non-text content",
            details="Response missing choices.",
        )

    first = choices[0] if isinstance(choices[0], dict) else None
    message = first.get("message") if isinstance(first, dict) else None
    if not isinstance(message, dict):
        logger.error("extract_model_text_failed", extra={"reason": "missing_message", "shape": shape})
        raise UpstreamModelContentError(
            error="Upstream model returned non-text content",
            details="Response missing message block.",
        )

    content = message.get("content")
    logger.info(
        "extract_model_text_content_type",
        extra={"content_type": type(content).__name__, "shape": shape},
    )

    if isinstance(content, str):
        text = content.strip()
        if text:
            return content
        logger.error("extract_model_text_failed", extra={"reason": "empty_string_content", "shape": shape})
        raise UpstreamModelContentError(
            error="Upstream model returned non-text content",
            details="Message content was empty.",
        )

    if isinstance(content, list):
        text_parts = []
        for part in content:
            maybe = _part_text(part).strip()
            if maybe:
                text_parts.append(maybe)
        if text_parts:
            return "\n".join(text_parts)
        payload_snippet = _truncate(json.dumps(payload, ensure_ascii=False))
        logger.error(
            "extract_model_text_failed",
            extra={"reason": "no_text_parts", "shape": shape, "payload_snippet": payload_snippet},
        )
        raise UpstreamModelContentError(
            error="Upstream model returned non-text content",
            details="Message content parts had no text.",
        )

    payload_snippet = _truncate(json.dumps(payload, ensure_ascii=False))
    logger.error(
        "extract_model_text_failed",
        extra={"reason": "unsupported_content_shape", "shape": shape, "payload_snippet": payload_snippet},
    )
    raise UpstreamModelContentError(
        error="Upstream model returned non-text content",
        details="Message content was not a supported text shape.",
    )


def _extract_text_guard_cases() -> None:
    # Lightweight inline guards for common provider response shapes.
    assert (
        extract_text_from_response({"choices": [{"message": {"content": "{\"ok\":true}"}}]})
        == "{\"ok\":true}"
    )
    assert (
        extract_text_from_response(
            {
                "choices": [
                    {
                        "message": {
                            "content": [
                                {"type": "text", "text": "{\"a\":1}"},
                                {"type": "other", "metadata": 1},
                                {"type": "output_text", "text": {"value": "{\"b\":2}"}},
                            ]
                        }
                    }
                ]
            }
        )
        == "{\"a\":1}\n{\"b\":2}"
    )
    try:
        extract_text_from_response({"choices": [{"message": {"content": []}}]})
        raise AssertionError("Expected UpstreamModelContentError for empty content list.")
    except UpstreamModelContentError:
        pass


if os.getenv("AZURE_FOUNDRY_RUN_GUARDS", "0") == "1":
    _extract_text_guard_cases()


async def call_azure_foundry(prompt: str) -> str:
    timeout = httpx.Timeout(LLM_HTTP_TIMEOUT_SEC)
    if not AZURE_AI_API_KEY:
        raise RuntimeError("AZURE_AI_API_KEY is not set.")

    base = AZURE_AI_ENDPOINT.rstrip("/")
    url = f"{base}/openai/deployments/{AZURE_AI_DEPLOYMENT}/chat/completions"

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            url,
            params={"api-version": AZURE_AI_API_VERSION},
            headers={
                "api-key": AZURE_AI_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "stream": False,
                "response_format": {"type": "json_object"},
            },
        )

        response.raise_for_status()
        payload = response.json()

        if isinstance(payload, dict) and "error" in payload:
            err = payload.get("error")
            if isinstance(err, dict):
                message = str(err.get("message", "")).strip()
                code = str(err.get("code", "")).strip()
                detail = message or json.dumps(err, ensure_ascii=False)[:500]
                if code:
                    detail = f"{code}: {detail}"
            else:
                detail = str(err)
            raise RuntimeError(f"Upstream model error payload: {detail}")
        return extract_text_from_response(payload)
