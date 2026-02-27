// src/lib/api.ts
import type { ApiAnalyzeResponse, UiAnalyzeResponse } from "../types/analyze";
import { normalizeAnalyzeResponse } from "./normalizeAnalyzeResponse";

export async function analyzePassage(payload: unknown): Promise<UiAnalyzeResponse> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Analyze failed (${res.status}): ${text || res.statusText}`);
  }

  const apiData = (await res.json()) as ApiAnalyzeResponse;

  // Normalize to stable UI shape
  return normalizeAnalyzeResponse(apiData);
}