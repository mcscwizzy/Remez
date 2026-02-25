import os
import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://192.168.1.217:11435")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3:8b")


async def call_ollama(prompt: str) -> str:
    timeout = httpx.Timeout(300.0)  # 5 minutes

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "stream": False,
                "format": "json"
            },
        )

        response.raise_for_status()
        return response.json()["message"]["content"]