import os
import httpx
import json
import logging
from typing import Any, Dict

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
EXTRACTOR_PREVIEW_CHARS = int(os.getenv("EXTRACTOR_PREVIEW_CHARS", "500"))
logger = logging.getLogger("remez")


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


def _preview(value: Any, limit: int = EXTRACTOR_PREVIEW_CHARS) -> str:
    try:
        text = repr(value)
    except Exception:
        text = f"<unrepr:{type(value).__name__}>"
    return _truncate(text, limit=limit)


def _content_debug(content: Any) -> Dict[str, Any]:
    debug: Dict[str, Any] = {
        "content_type": type(content).__name__,
        "content_repr": _preview(content),
    }
    if isinstance(content, list):
        debug["list_len"] = len(content)
        if content:
            debug["first_item_type"] = type(content[0]).__name__
            debug["first_item_repr"] = _preview(content[0])
    elif isinstance(content, dict):
        debug["dict_keys"] = sorted([str(k) for k in content.keys()])[:30]
    elif content is not None and hasattr(content, "__dict__"):
        debug["object_attrs"] = sorted([str(k) for k in vars(content).keys()])[:30]
    return debug


def _extract_text_candidate(value: Any, depth: int = 0) -> str:
    if depth > 3:
        return ""
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    if isinstance(value, list):
        parts = [_extract_text_candidate(v, depth + 1).strip() for v in value]
        parts = [p for p in parts if p]
        return "\n".join(parts)
    if isinstance(value, dict):
        preferred = ["text", "content", "value", "output_text", "message", "body"]
        for key in preferred:
            if key in value:
                hit = _extract_text_candidate(value.get(key), depth + 1).strip()
                if hit:
                    return hit
        for item in value.values():
            hit = _extract_text_candidate(item, depth + 1).strip()
            if hit:
                return hit
        return ""
    for attr in ("text", "content", "value"):
        if hasattr(value, attr):
            hit = _extract_text_candidate(getattr(value, attr), depth + 1).strip()
            if hit:
                return hit
    return ""


def extract_text_from_response(payload: Any) -> Dict[str, Any]:
    shape = _payload_shape(payload)
    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not isinstance(choices, list) or not choices:
        logger.error("extract_model_text_failed", extra={"reason": "missing_choices", "shape": shape})
        return {
            "ok": False,
            "error": "Upstream model returned unsupported content shape",
            "stage": "extract_model_text",
            "content_type": type(choices).__name__,
            "details": "Response missing choices.",
        }

    first = choices[0] if isinstance(choices[0], dict) else None
    message = first.get("message") if isinstance(first, dict) else None
    if not isinstance(message, dict):
        logger.error("extract_model_text_failed", extra={"reason": "missing_message", "shape": shape})
        return {
            "ok": False,
            "error": "Upstream model returned unsupported content shape",
            "stage": "extract_model_text",
            "content_type": type(message).__name__,
            "details": "Response missing message block.",
        }

    content = message.get("content")
    content_debug = _content_debug(content)
    logger.info(
        "extract_model_text_content_type",
        extra={"shape": shape, **content_debug},
    )

    extracted = _extract_text_candidate(content).strip()
    if extracted:
        logger.info(
            "extract_model_text_success",
            extra={"extracted_text_len": len(extracted), "content_type": type(content).__name__},
        )
        return {"ok": True, "content": extracted}

    payload_snippet = _truncate(json.dumps(payload, ensure_ascii=False))
    logger.error(
        "extract_model_text_failed",
        extra={"reason": "empty_or_unsupported_content", "shape": shape, **content_debug, "payload_snippet": payload_snippet},
    )
    return {
        "ok": False,
        "error": "Upstream model returned unsupported content shape",
        "stage": "extract_model_text",
        "content_type": type(content).__name__,
        "details": "Message content was empty or not text-bearing.",
    }


def _extract_text_guard_cases() -> None:
    # Lightweight inline guards for common provider response shapes.
    r1 = extract_text_from_response({"choices": [{"message": {"content": "{\"ok\":true}"}}]})
    assert r1.get("ok") is True and r1.get("content") == "{\"ok\":true}"

    r2 = extract_text_from_response(
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
    assert r2.get("ok") is True and r2.get("content") == "{\"a\":1}\n{\"b\":2}"

    r3 = extract_text_from_response({"choices": [{"message": {"content": []}}]})
    assert r3.get("ok") is False and r3.get("stage") == "extract_model_text"


if os.getenv("AZURE_FOUNDRY_RUN_GUARDS", "0") == "1":
    _extract_text_guard_cases()


async def call_azure_foundry(prompt: str) -> Dict[str, Any]:
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
            return {
                "ok": False,
                "error": "Upstream model call failed",
                "stage": "model_call",
                "details": detail,
                "content_type": "error_payload",
            }
        return extract_text_from_response(payload)
