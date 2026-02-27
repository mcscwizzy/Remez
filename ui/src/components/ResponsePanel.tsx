import type { AnalyzeResponse } from "../types";
import { Tabs } from "./Tabs";
import { useMemo, useState } from "react";

export function ResponsePanel({ data }: { data: AnalyzeResponse | null }) {
  const [tab, setTab] = useState("peshat");

  const tabs = useMemo(
    () => [
      { id: "peshat", label: "Peshat" },
      { id: "remez", label: "Remez" },
      { id: "derash", label: "Derash" },
      { id: "sod", label: "Sod" },
      { id: "chiasm", label: "Chiasm" },
      { id: "notes", label: "Notes" },
      { id: "raw", label: "Raw" }
    ],
    []
  );

  if (!data) {
    return (
      <div className="h-full rounded-2xl border p-6">
        <div className="text-lg font-semibold">Output</div>
        <p className="mt-2 text-sm text-gray-600">Run an analysis to see results here.</p>
      </div>
    );
  }

  const sectionText =
    tab === "peshat"
      ? data.peshat_summary
      : tab === "remez"
        ? data.remez_summary
        : tab === "derash"
          ? data.derash_summary
          : tab === "sod"
            ? data.sod_summary
            : "";

  return (
    <div className="h-full rounded-2xl border p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Output</div>
          <div className="text-sm text-gray-600">{data.reference ?? ""}</div>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {["peshat", "remez", "derash", "sod"].includes(tab) && (
        <div className="whitespace-pre-wrap leading-relaxed text-sm">
          {sectionText?.trim() ? sectionText : "No content returned for this section."}
        </div>
      )}

      {tab === "chiasm" && (
        <div className="text-sm space-y-3">
          <div className="rounded-xl border p-3">
            <div className="font-semibold">Detected</div>
            <div>{data.chiasm?.detected ? "Yes" : "No"}</div>
            {typeof data.chiasm?.confidence === "number" && (
              <div className="text-gray-600">
                Confidence: {Math.round(data.chiasm.confidence * 100)}%
              </div>
            )}
          </div>

          {data.chiasm?.hits?.length ? (
            <div className="space-y-2">
              {data.chiasm.hits.map((h, idx) => (
                <div key={idx} className="rounded-xl border p-3">
                  <div className="font-semibold">{h.label}</div>
                  {(h.startVerse || h.endVerse) && (
                    <div className="text-gray-600">
                      {h.startVerse ?? ""}
                      {h.startVerse && h.endVerse ? "–" : ""}
                      {h.endVerse ?? ""}
                    </div>
                  )}
                  {h.notes && <div className="mt-2 whitespace-pre-wrap">{h.notes}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-600">No chiastic hits returned.</div>
          )}

          {data.chiasm?.reasoning && (
            <div className="rounded-xl border p-3">
              <div className="font-semibold">Reasoning</div>
              <div className="mt-2 whitespace-pre-wrap">{data.chiasm.reasoning}</div>
            </div>
          )}
        </div>
      )}

      {tab === "notes" && (
        <div className="text-sm space-y-4">
          <div>
            <div className="font-semibold">Keywords</div>
            <div className="mt-1 text-gray-700">{(data.keywords ?? []).join(", ") || "—"}</div>
          </div>
          <div>
            <div className="font-semibold">Themes</div>
            <div className="mt-1 text-gray-700">{(data.themes ?? []).join(", ") || "—"}</div>
          </div>
          <div>
            <div className="font-semibold">Hebraic worldview notes</div>
            <ul className="mt-1 list-disc pl-5 text-gray-700">
              {(data.hebraic_worldview_notes ?? []).length ? (
                data.hebraic_worldview_notes!.map((x, i) => <li key={i}>{x}</li>)
              ) : (
                <li>—</li>
              )}
            </ul>
          </div>
          <div>
            <div className="font-semibold">NT parallels</div>
            <ul className="mt-1 list-disc pl-5 text-gray-700">
              {(data.nt_parallels ?? []).length ? (
                data.nt_parallels!.map((x, i) => <li key={i}>{x}</li>)
              ) : (
                <li>—</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {tab === "raw" && (
        <pre className="text-xs rounded-xl border p-3 overflow-auto bg-gray-50">
          {JSON.stringify(data.raw ?? data, null, 2)}
        </pre>
      )}
    </div>
  );
}
