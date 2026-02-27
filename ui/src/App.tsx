import { useMemo, useState } from "react";
import "./index.css";
import type { AnalyzeRequest, RemezMode } from "./types";
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
  const [reference, setReference] = useState("Genesis 15:1-6");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<RemezMode>("peshat");

  const [includeChiasm, setIncludeChiasm] = useState(true);
  const [includeHebraicNotes, setIncludeHebraicNotes] = useState(true);
  const [includeNTParallels, setIncludeNTParallels] = useState(true);

  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<UiAnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);

  const payload = useMemo<AnalyzeRequest>(
    () => ({
      reference: reference.trim() ? reference.trim() : undefined,
      text: text.trim() ? text.trim() : undefined,
      mode,
      includeChiasm,
      includeHebraicNotes,
      includeNTParallels
    }),
    [reference, text, mode, includeChiasm, includeHebraicNotes, includeNTParallels]
  );

  async function run() {
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
      setError(msg);
      setHistory((h) => h.map((x) => (x.id === item.id ? { ...x, error: msg } : x)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6">
          <div className="text-2xl font-bold">Remez</div>
          <div className="text-sm text-gray-600">
            Structured Bible study output (Peshat → Remez → Derash → Sod) + chiasm detection.
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-2xl border p-4 space-y-3">
              <div className="font-semibold">Input</div>

              <label className="block">
                <div className="text-sm text-gray-600">Reference</div>
                <input
                  className="mt-1 w-full rounded-xl border p-2"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Genesis 15:1-6"
                />
              </label>

              <label className="block">
                <div className="text-sm text-gray-600">Or paste text</div>
                <textarea
                  className="mt-1 w-full rounded-xl border p-2 h-28"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste passage text here (optional)"
                />
              </label>

              <label className="block">
                <div className="text-sm text-gray-600">Mode</div>
                <select
                  className="mt-1 w-full rounded-xl border p-2"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as RemezMode)}
                >
                  <option value="peshat">Peshat</option>
                  <option value="remez">Remez</option>
                  <option value="derash">Derash</option>
                  <option value="sod">Sod</option>
                </select>
              </label>

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

              <button
                className="w-full rounded-xl border bg-black text-white py-2 disabled:opacity-60"
                onClick={run}
                disabled={loading}
                type="button"
              >
                {loading ? "Running..." : "Analyze"}
              </button>

              {error && (
                <div className="rounded-xl border p-3 text-sm">
                  <div className="font-semibold">Error</div>
                  <div className="text-gray-700 mt-1">{error}</div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border p-4">
              <div className="font-semibold mb-2">History</div>
              <div className="space-y-2 max-h-[340px] overflow-auto pr-1">
                {history.length === 0 && <div className="text-sm text-gray-600">No runs yet.</div>}
                {history.map((h) => (
                  <button
                    key={h.id}
                    className="w-full text-left rounded-xl border p-3 hover:bg-gray-50"
                    type="button"
                    onClick={() => setCurrent(h.response ?? null)}
                    title="Click to load output"
                  >
                    <div className="text-sm font-semibold">{h.request.reference ?? "Pasted text"}</div>
                    <div className="text-xs text-gray-600">
                      {new Date(h.ts).toLocaleString()} • {h.request.mode}
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
