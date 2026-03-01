// src/lib/api.ts
import type { ApiAnalyzeResponse, UiAnalyzeResponse } from "../types/analyze";
import { normalizeAnalyzeResponse } from "./normalizeAnalyzeResponse";

const REQUEST_TIMEOUT_MS = 300_000;

export async function analyzePassage(payload: unknown): Promise<UiAnalyzeResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Analyze timed out. Try a shorter passage.");
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }

  const contentType = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    if (contentType.includes("application/json")) {
      const err = await res.json().catch(() => null);
      const detail = err?.detail ?? err?.message ?? res.statusText;
      throw new Error(`Analyze failed (${res.status}): ${detail}`);
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Analyze failed (${res.status}): ${text || res.statusText}`);
  }

  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(`Analyze failed (non-JSON response): ${text || res.statusText}`);
  }

  const apiData = (await res.json()) as ApiAnalyzeResponse;

  // Normalize to stable UI shape
  return normalizeAnalyzeResponse(apiData);
}
