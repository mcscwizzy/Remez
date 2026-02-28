import { useMemo, useState } from "react";
import { Tabs } from "./Tabs";
import type { UiAnalyzeResponse, LayerId } from "../types/analyze";
import { VisualPanel } from "./VisualPanel";

function isLayerTab(tab: string): tab is LayerId {
  return tab === "overview";
}

export function ResponsePanel({ data }: { data: UiAnalyzeResponse | null }) {
  const [tab, setTab] = useState<LayerId | "visual" | "chiasm" | "notes" | "raw">("overview");

  const tabs = useMemo(
    () => [
      { id: "overview", label: "Overview" },
      { id: "visual", label: "Visual" },
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

  const layerText = isLayerTab(tab) ? data.layers[tab]?.content ?? "" : "";

  return (
    <div className="h-full rounded-2xl border p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Output</div>
          <div className="text-sm text-gray-600">{data.reference}</div>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab as any} />

      {isLayerTab(tab) && (
        <div className="whitespace-pre-wrap leading-relaxed text-sm">
          {layerText.trim() ? layerText : "No content returned for this section."}
        </div>
      )}

      {tab === "chiasm" && (
        <div className="text-sm space-y-3">
          <div className="rounded-xl border p-3">
            <div className="font-semibold">Detected structure</div>
            <div className="mt-1">{data.structure.detected || "—"}</div>
            {data.structure.confidence && (
              <div className="text-gray-600 mt-1">Confidence: {String(data.structure.confidence)}</div>
            )}
          </div>

          {/* Parallels are useful NOW and later become visualization edges */}
          <div className="rounded-xl border p-3">
            <div className="font-semibold">Parallels</div>
            {data.structure.parallels.length ? (
              <div className="mt-2 space-y-2">
                {data.structure.parallels.map((p) => (
                  <div key={p.id} className="rounded-lg border p-3">
                    <div className="font-medium">{p.id}</div>
                    {p.line_ids?.length ? (
                      <div className="text-gray-600">Lines: {p.line_ids.join(", ")}</div>
                    ) : null}
                    {p.anchor_type ? <div className="text-gray-600">Anchor: {p.anchor_type}</div> : null}
                    {p.why ? <div className="mt-2 whitespace-pre-wrap">{p.why}</div> : null}
                    {p.evidence?.length ? (
                      <ul className="mt-2 list-disc pl-5 text-gray-700">
                        {p.evidence.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-600 mt-1">No parallels returned.</div>
            )}
          </div>

          <div className="rounded-xl border p-3">
            <div className="font-semibold">Chiasm candidates</div>
            {data.structure.chiasm_candidates.length ? (
              <div className="mt-2 text-gray-700">
                {data.structure.chiasm_candidates.length} candidate(s) returned.
                <div className="text-gray-600 mt-1">
                  (We’ll render these as a diagram once the backend emits a standard candidate schema.)
                </div>
              </div>
            ) : (
              <div className="text-gray-600 mt-1">No chiastic candidates returned.</div>
            )}

            {data.structure.best_chiasm ? (
              <div className="mt-2 text-gray-700">
                <div className="font-medium">Best chiasm</div>
                <div className="text-gray-600">(Raw object available in Raw tab.)</div>
              </div>
            ) : null}
          </div>

          {data.structure.cautions.length ? (
            <div className="rounded-xl border p-3">
              <div className="font-semibold">Cautions</div>
              <ul className="mt-2 list-disc pl-5 text-gray-700">
                {data.structure.cautions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Visualization hook */}
          {data.visualizations?.graph ? (
            <div className="rounded-xl border p-3">
              <div className="font-semibold">Visualizations</div>
              <div className="text-gray-600 mt-1">
                Graph payload present ({data.visualizations.graph.nodes.length} nodes,{" "}
                {data.visualizations.graph.edges.length} edges). Rendering coming next.
              </div>
            </div>
          ) : null}
        </div>
      )}

      {tab === "visual" && <VisualPanel data={data} />}

      {tab === "notes" && (
        <div className="text-sm space-y-4">
          <div>
            <div className="font-semibold">Keywords</div>
            <div className="mt-1 text-gray-700">{data.notes.keywords.join(", ") || "—"}</div>
          </div>

          <div>
            <div className="font-semibold">Themes</div>
            <div className="mt-1 text-gray-700">{data.notes.themes.join(", ") || "—"}</div>
          </div>

          <div>
            <div className="font-semibold">Hebraic worldview notes</div>
            <ul className="mt-1 list-disc pl-5 text-gray-700">
              {data.notes.worldview.length ? data.notes.worldview.map((x, i) => <li key={i}>{x}</li>) : <li>—</li>}
            </ul>
          </div>

          <div>
            <div className="font-semibold">Motifs and patterns</div>
            <ul className="mt-1 list-disc pl-5 text-gray-700">
              {data.notes.motifs.length ? data.notes.motifs.map((x, i) => <li key={i}>{x}</li>) : <li>—</li>}
            </ul>
          </div>

          <div>
            <div className="font-semibold">Second Temple bridge</div>
            <ul className="mt-1 list-disc pl-5 text-gray-700">
              {data.notes.secondTemple.length ? (
                data.notes.secondTemple.map((x, i) => <li key={i}>{x}</li>)
              ) : (
                <li>—</li>
              )}
            </ul>
          </div>

          <div>
            <div className="font-semibold">Key terms</div>
            {data.notes.keyTerms.length ? (
              <div className="mt-2 space-y-2">
                {data.notes.keyTerms.map((t, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="font-medium">
                      {t.term}
                      {t.language ? <span className="text-gray-600"> ({t.language})</span> : null}
                    </div>
                    {t.gloss ? <div className="text-gray-700 mt-1">{t.gloss}</div> : null}
                    {t.why_it_matters ? (
                      <div className="text-gray-600 mt-2 whitespace-pre-wrap">{t.why_it_matters}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-1 text-gray-600">—</div>
            )}
          </div>

          <div>
            <div className="font-semibold">NT parallels</div>
            <ul className="mt-1 list-disc pl-5 text-gray-700 space-y-1">
              {data.notes.ntParallels.length ? (
                data.notes.ntParallels.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium">{p.reference}</span>
                    {p.type ? <span className="text-gray-600"> ({p.type})</span> : null}
                    {p.reason ? <div className="text-gray-600">{p.reason}</div> : null}
                  </li>
                ))
              ) : (
                <li>—</li>
              )}
            </ul>
          </div>

          {data.notes.alternatives.length ? (
            <div>
              <div className="font-semibold">Notable alternatives</div>
              <ul className="mt-1 list-disc pl-5 text-gray-700">
                {data.notes.alternatives.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.notes.application.length ? (
            <div>
              <div className="font-semibold">Application</div>
              <ul className="mt-1 list-disc pl-5 text-gray-700">
                {data.notes.application.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
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
