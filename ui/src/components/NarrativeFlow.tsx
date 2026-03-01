import { useMemo, useState } from "react";
import type { UiAnalyzeResponse } from "../types/analyze";

const MAX_SUMMARY_CHARS = 96;

const truncate = (value: string, limit = MAX_SUMMARY_CHARS) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

function toRangeLabel(lineIds: string[], indexById: Map<string, number>) {
  if (!lineIds.length) return "";
  const ordered = [...lineIds].sort((a, b) => (indexById.get(a) ?? Number.MAX_SAFE_INTEGER) - (indexById.get(b) ?? Number.MAX_SAFE_INTEGER));
  if (ordered.length === 1) return ordered[0];
  return `${ordered[0]}-${ordered[ordered.length - 1]}`;
}

export function NarrativeFlow({ data }: { data: UiAnalyzeResponse }) {
  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
  const lines = data.structure.lines;
  const scenes = data.narrative_flow?.scenes ?? [];

  const lineById = useMemo(() => {
    const map = new Map<string, { id: string; text: string }>();
    lines.forEach((line) => map.set(line.id, line));
    return map;
  }, [lines]);

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((line, idx) => map.set(line.id, idx));
    return map;
  }, [lines]);

  const selectedBeat = useMemo(() => {
    for (const scene of scenes) {
      for (const beat of scene.beats) {
        if (beat.id === selectedBeatId) return { scene, beat };
      }
    }
    return null;
  }, [scenes, selectedBeatId]);

  const selectedLines = useMemo(() => {
    if (!selectedBeat) return [];
    return selectedBeat.beat.line_ids
      .map((id) => lineById.get(id))
      .filter((line): line is NonNullable<typeof line> => Boolean(line));
  }, [lineById, selectedBeat]);

  if (!scenes.length) return <div className="text-sm text-gray-600">No narrative flow data available.</div>;

  return (
    <div className="card card-edge p-4 narrative-layout">
      <div className="narrative-column">
        {scenes.map((scene) => (
          <section key={scene.id} className="narrative-scene">
            <header className="narrative-scene-header">
              <h3 className="narrative-scene-title">{scene.title}</h3>
            </header>
            <div className="narrative-scene-beats">
              {scene.beats.map((beat, idx) => (
                <div key={beat.id} className="narrative-item">
                  <button
                    type="button"
                    className={`narrative-node ${selectedBeatId === beat.id ? "is-selected" : ""}`}
                    onClick={() => setSelectedBeatId(beat.id)}
                  >
                    <div className="narrative-node-head">
                      <span className="narrative-node-label">{beat.label}</span>
                      <span className="narrative-node-range">{toRangeLabel(beat.line_ids, indexById)}</span>
                    </div>
                    <div className="narrative-node-text">{truncate(beat.summary, MAX_SUMMARY_CHARS)}</div>
                  </button>
                  {idx < scene.beats.length - 1 ? <div className="narrative-arrow">↓</div> : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <aside className="narrative-panel">
        {!selectedBeat ? (
          <div className="narrative-panel-empty">Select a beat to view the full text.</div>
        ) : (
          <div className="narrative-panel-content">
            <div className="narrative-panel-title">{selectedBeat.scene.title}</div>
            <div className="narrative-panel-range">
              {selectedBeat.beat.label} · {toRangeLabel(selectedBeat.beat.line_ids, indexById)}
            </div>
            <div className="narrative-panel-summary">{selectedBeat.beat.summary}</div>
            <div className="narrative-panel-lines">
              {selectedLines.map((line) => (
                <div key={line.id} className="narrative-panel-line">
                  <span className="narrative-panel-line-id">{line.id}</span>
                  <span className="narrative-panel-line-text">{line.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
