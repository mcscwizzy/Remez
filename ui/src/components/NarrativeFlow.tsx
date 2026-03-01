import { useMemo, useState } from "react";
import type { UiAnalyzeResponse } from "../types/analyze";

const MAX_EXCERPT_CHARS = 160;

type BeatType = "section" | "action" | "evaluation" | "closure";

type Beat = {
  id: string;
  lineIds: string[];
  type: BeatType;
  excerpt: string;
};

const truncate = (value: string, limit = MAX_EXCERPT_CHARS) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

const isEvaluation = (text: string) => /\b(good|very good|blessed|approved|pleasant)\b/i.test(text);

export function NarrativeFlow({ data }: { data: UiAnalyzeResponse }) {
  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
  const lines = data.structure.lines;
  const parallels = data.structure.parallels;

  const beats = useMemo<Beat[]>(() => {
    if (!lines.length) return [];

    const indexById = new Map<string, number>();
    lines.forEach((line, idx) => indexById.set(line.id, idx));

    const ranges = parallels
      .map((group) => {
        const ids = group.line_ids ?? [];
        const indices = ids.map((id) => indexById.get(id)).filter((i): i is number => i !== undefined);
        if (indices.length < 2) return null;
        const min = Math.min(...indices);
        const max = Math.max(...indices);
        const contiguous = max - min + 1 === indices.length;
        if (!contiguous) return null;
        return { start: min, end: max };
      })
      .filter((range): range is { start: number; end: number } => Boolean(range))
      .sort((a, b) => a.start - b.start);

    const used = new Set<number>();
    const normalized: { start: number; end: number }[] = [];
    for (const range of ranges) {
      let overlaps = false;
      for (let i = range.start; i <= range.end; i += 1) {
        if (used.has(i)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      for (let i = range.start; i <= range.end; i += 1) used.add(i);
      normalized.push(range);
    }

    const beats: Beat[] = [];
    let i = 0;
    while (i < lines.length) {
      const range = normalized.find((r) => r.start === i);
      let end = i;
      if (range) {
        end = range.end;
      } else {
        end = Math.min(i + 1, lines.length - 1);
      }

      const beatLines = lines.slice(i, end + 1);
      const text = beatLines.map((line) => line.text).join(" ");
      const beatIndex = beats.length;
      const type: BeatType =
        beatIndex === 0
          ? "section"
          : end === lines.length - 1
            ? "closure"
            : isEvaluation(text)
              ? "evaluation"
              : "action";

      beats.push({
        id: `beat-${i}-${end}`,
        lineIds: beatLines.map((line) => line.id),
        type,
        excerpt: truncate(text)
      });

      i = end + 1;
    }

    return beats;
  }, [lines, parallels]);

  const selectedBeat = useMemo(
    () => beats.find((beat) => beat.id === selectedBeatId) ?? null,
    [beats, selectedBeatId]
  );

  const selectedLines = useMemo(() => {
    if (!selectedBeat) return [];
    return selectedBeat.lineIds
      .map((id) => lines.find((line) => line.id === id))
      .filter((line): line is NonNullable<typeof line> => Boolean(line));
  }, [lines, selectedBeat]);

  if (!lines.length) return <div className="text-sm text-gray-600">No structure data available.</div>;

  return (
    <div className="card card-edge p-4 narrative-layout">
      <div className="narrative-column">
        {beats.map((beat, idx) => (
          <div key={beat.id} className="narrative-item">
            <button
              type="button"
              className={`narrative-node narrative-node-${beat.type}`}
              onClick={() => setSelectedBeatId(beat.id)}
            >
              <div className="narrative-node-range">
                {beat.lineIds[0]}–{beat.lineIds[beat.lineIds.length - 1]}
              </div>
              <div className="narrative-node-text">{beat.excerpt}</div>
            </button>
            {idx < beats.length - 1 ? <div className="narrative-arrow">↓</div> : null}
          </div>
        ))}
      </div>
      <aside className="narrative-panel">
        {!selectedBeat ? (
          <div className="narrative-panel-empty">Select a block to view the full text.</div>
        ) : (
          <div className="narrative-panel-content">
            <div className="narrative-panel-title">
              {selectedBeat.lineIds[0]}–{selectedBeat.lineIds[selectedBeat.lineIds.length - 1]}
            </div>
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
