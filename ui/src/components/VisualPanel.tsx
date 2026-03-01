import { useState } from "react";
import type { UiAnalyzeResponse } from "../types/analyze";
import { StructureFlow } from "./StructureFlow";
import { ChiasmView } from "./ChiasmView";

type ViewMode = "structure" | "chiasm";

export function VisualPanel({ data }: { data: UiAnalyzeResponse }) {
  const [view, setView] = useState<ViewMode>("structure");
  const detected = data.structure.detected;
  const hint =
    detected === "chiasm"
      ? "This passage appears to form a chiasm. The center (pivot) is the main emphasis of the structure."
      : detected === "parallelism"
        ? "This passage is structured primarily through parallel development. Look for repeated or intensifying ideas rather than a single pivot."
        : null;

  return (
    <div className="space-y-4">
      {hint ? (
        <div className="rounded-xl border border-[color:var(--color-border)] bg-white/70 px-3 py-2 text-sm text-gray-700">
          {hint}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setView("structure")}
          className={`rounded-lg border px-3 py-1 text-sm ${
            view === "structure" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300"
          }`}
        >
          Structure View
        </button>
        <button
          type="button"
          onClick={() => setView("chiasm")}
          className={`rounded-lg border px-3 py-1 text-sm ${
            view === "chiasm" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300"
          }`}
        >
          Chiasm View
        </button>
      </div>

      {view === "structure" ? <StructureFlow data={data} /> : <ChiasmView data={data} />}
    </div>
  );
}
