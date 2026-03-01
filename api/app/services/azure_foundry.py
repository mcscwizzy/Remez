import os
import httpx

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
        return payload["choices"][0]["message"]["content"]
