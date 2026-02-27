import type { AnalyzeRequest, AnalyzeResponse } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function analyzePassage(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }

  const data = (await res.json()) as AnalyzeResponse;
  return { ...data, raw: data };
}
