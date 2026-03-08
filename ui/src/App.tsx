import { useEffect, useMemo, useState } from "react";
import "./index.css";
import type { AnalyzeRequest } from "./types";
import type { UiAnalyzeResponse } from "./types/analyze";
import { analyzePassage } from "./lib/api";
import { Toggle } from "./components/Toggle";
import { ResponsePanel } from "./components/ResponsePanel";

type HistoryItem = {
  id: string;
  ts: number;
  request: AnalyzeRequest;
  response?: UiAnalyzeResponse;
  error?: string;
};

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

export default function App() {
  const [showGuideBanner, setShowGuideBanner] = useState(false);
  const [reference, setReference] = useState("");
  const [customText, setCustomText] = useState("");
  const [useCustomText, setUseCustomText] = useState(false);
  const [apiReady, setApiReady] = useState<"unknown" | "ready" | "error">("unknown");
  const maxInputChars = 12000;

  const [includeChiasm, setIncludeChiasm] = useState(true);
  const [includeHebraicNotes, setIncludeHebraicNotes] = useState(true);
  const [includeNTParallels, setIncludeNTParallels] = useState(true);

  const [loading, setLoading] = useState(false);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [current, setCurrent] = useState<UiAnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);

  const payload = useMemo<AnalyzeRequest>(
    () => ({
      reference: !useCustomText && reference.trim() ? reference.trim() : undefined,
      text: useCustomText && customText.trim() ? customText.trim() : undefined,
      source_mode: useCustomText ? "custom_text" : "reference",
      includeChiasm,
      includeHebraicNotes,
      includeNTParallels
    }),
    [reference, customText, useCustomText, includeChiasm, includeHebraicNotes, includeNTParallels]
  );

  useEffect(() => {
    try {
      const seen = localStorage.getItem("remez_seen_guide");
      if (!seen) setShowGuideBanner(true);
    } catch {
      setShowGuideBanner(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    fetch("/health", { signal: controller.signal })
      .then((res) => {
        setApiReady(res.ok ? "ready" : "error");
      })
      .catch(() => setApiReady("error"))
      .finally(() => window.clearTimeout(timeoutId));
    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadingElapsed(0);
      return;
    }
    const start = Date.now();
    const id = window.setInterval(() => {
      setLoadingElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [loading]);

  async function run() {
    if (useCustomText) {
      if (!customText.trim()) {
        setError("Paste custom passage text to analyze.");
        return;
      }
      if (customText.trim().length > maxInputChars) {
        setError(`Passage too long. Please shorten the text (max ${maxInputChars} characters).`);
        return;
      }
    } else {
      if (!reference.trim()) {
        setError("Enter a reference (e.g., Genesis 1).");
        return;
      }
    }
    setLoading(true);
    setError(null);

    const item: HistoryItem = { id: uid(), ts: Date.now(), request: payload };
    setHistory((h) => [item, ...h].slice(0, 25));

    try {
      const res = await analyzePassage(payload);
      setCurrent(res);
      setHistory((h) => h.map((x) => (x.id === item.id ? { ...x, response: res } : x)));
    } catch (e: any) {
      const msg = e?.message ?? "Unknown error";
      const friendly = msg.includes("Reference not found in local ASV source.")
        ? "Reference not found in local ASV source."
        : msg;
      setError(friendly);
      setHistory((h) => h.map((x) => (x.id === item.id ? { ...x, error: friendly } : x)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen app-shell parchment-texture">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {showGuideBanner ? (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-[color:var(--color-border)] bg-white/70 px-4 py-2 text-sm">
            <div>New here? Open the Guide tab to learn how to read structure and chiasms.</div>
            <button
              type="button"
              className="rounded-lg border border-[color:var(--color-border)] bg-white/70 px-2 py-1 text-xs"
              onClick={() => {
                localStorage.setItem("remez_seen_guide", "1");
                setShowGuideBanner(false);
              }}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        <header className="mb-6">
          <div className="text-3xl folio-title">Remez</div>
          <div className="text-sm folio-subtitle">Structured Bible study output (Overview) + chiasm detection.</div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4 space-y-4">
            <div className="card card-edge p-4 space-y-3">
              <div className="section-title">Input</div>

              <label className="block">
                <div className="text-sm text-gray-600">Reference (required)</div>
                <input
                  className="mt-1 w-full textarea-field h-12"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Genesis 1, Psalm 82, Philippians 2:6-11"
                />
                <div className="mt-2 text-xs text-gray-500">Default source: ASV (public domain)</div>
              </label>

              <Toggle label="Advanced / Custom Text" checked={useCustomText} onChange={setUseCustomText} />

              {useCustomText ? (
                <label className="block">
                  <div className="text-sm text-gray-600">Custom text (overrides reference)</div>
                  <textarea
                    className="mt-1 w-full textarea-field h-48"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="Paste the full passage text here"
                  />
                </label>
              ) : null}

              <div className="grid gap-2">
                <Toggle
                  label="Include chiasm detection"
                  checked={includeChiasm}
                  onChange={setIncludeChiasm}
                />
                <Toggle
                  label="Include Hebraic worldview notes"
                  checked={includeHebraicNotes}
                  onChange={setIncludeHebraicNotes}
                />
                <Toggle
                  label="Include NT parallels"
                  checked={includeNTParallels}
                  onChange={setIncludeNTParallels}
                />
              </div>

              <button className="w-full btn-ink py-2 disabled:opacity-60" onClick={run} disabled={loading} type="button">
                {loading ? "Running..." : "Analyze"}
              </button>
              {apiReady === "unknown" ? (
                <div className="text-xs text-gray-600">Warming up API…</div>
              ) : apiReady === "error" ? (
                <div className="text-xs text-gray-600">API readiness check failed. You can still try Analyze.</div>
              ) : null}
              {loading && loadingElapsed >= 15 ? (
                <div className="text-xs text-gray-600">Still working… long passages can take a minute or two.</div>
              ) : null}

              {error && (
                <div className="card-plain p-3 text-sm">
                  <div className="font-semibold">Error</div>
                  <div className="text-gray-700 mt-1">{error}</div>
                </div>
              )}
            </div>

            <div className="card card-edge p-4">
              <div className="section-title mb-2">History</div>
              <div className="space-y-2 max-h-[340px] overflow-auto pr-1">
                {history.length === 0 && <div className="text-sm text-gray-600">No runs yet.</div>}
                {history.map((h) => (
                  <button
                    key={h.id}
                    className="w-full text-left history-item p-3"
                    type="button"
                    onClick={() => setCurrent(h.response ?? null)}
                    title="Click to load output"
                  >
                    <div className="text-sm font-semibold">
                      {h.request.source_mode === "custom_text"
                        ? "Custom text"
                        : h.request.reference || "Reference"}
                    </div>
                    <div className="text-xs text-gray-600">
                      {new Date(h.ts).toLocaleString()}
                      {h.error ? " • error" : h.response ? " • ok" : ""}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 min-h-[640px]">
            <ResponsePanel data={current} />
          </div>
        </div>
      </div>
    </div>
  );
}
