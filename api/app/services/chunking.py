from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List


@dataclass
class Chunk:
    id: str
    text: str
    start_char: int
    end_char: int
    summary_label: str


def _last_break_index(pattern: str, window: str) -> int | None:
    matches = list(re.finditer(pattern, window, flags=re.MULTILINE))
    if not matches:
        return None
    return matches[-1].end()


def _find_preferred_split(text: str, start: int, max_chars: int) -> int:
    hard_end = min(len(text), start + max_chars)
    if hard_end >= len(text):
        return len(text)

    window = text[start:hard_end]
    if not window:
        return hard_end

    # Avoid tiny chunks from very early boundaries.
    min_end = start + max(200, int(max_chars * 0.55))

    candidates: List[int] = []

    # 1) Paragraph break
    idx = _last_break_index(r"\n\s*\n", window)
    if idx is not None:
        candidates.append(start + idx)

    # 2) Line break
    idx = _last_break_index(r"\n", window)
    if idx is not None:
        candidates.append(start + idx)

    # 3) Sentence ending
    idx = _last_break_index(r"[.!?](?:\s|$)", window)
    if idx is not None:
        candidates.append(start + idx)

    # 4) Verse-like number transition
    idx = _last_break_index(r"(?:^|\n)\s*\d{1,3}(?::\d{1,3})?\s+", window)
    if idx is not None:
        candidates.append(start + idx)

    for candidate in candidates:
        if candidate >= min_end:
            return candidate

    return hard_end


def chunk_passage(text: str, max_chars: int, overlap_chars: int) -> List[Chunk]:
    content = (text or "").strip()
    if not content:
        return []

    if len(content) <= max_chars:
        return [
            Chunk(
                id="chunk_1",
                text=content,
                start_char=0,
                end_char=len(content),
                summary_label="Chunk 1",
            )
        ]

    chunks: List[Chunk] = []
    start = 0
    idx = 1

    while start < len(content):
        end = _find_preferred_split(content, start, max_chars)
        if end <= start:
            end = min(len(content), start + max_chars)
            if end <= start:
                break

        chunk_text = content[start:end].strip()
        if chunk_text:
            chunks.append(
                Chunk(
                    id=f"chunk_{idx}",
                    text=chunk_text,
                    start_char=start,
                    end_char=end,
                    summary_label=f"Chunk {idx}",
                )
            )
            idx += 1

        if end >= len(content):
            break

        next_start = max(0, end - overlap_chars)
        if next_start <= start:
            next_start = end
        start = next_start

    return chunks
