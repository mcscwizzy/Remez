# Remez

**Remez** (Hebrew for “hint” or “allusion”) is a Bible study visualization engine designed to reveal structure, flow, and narrative patterns within Scripture.

Remez transforms passage text into structured graphs, verse summaries, keyword threads, and (eventually) intertextual parallels — helping readers *see* connections rather than simply be told about them.

---

## Vision

Remez is not a commentary engine and not a sermon generator.

Its purpose is observational:

- Surface structural flow
- Highlight repeated words and themes
- Visualize cause, contrast, and sequence
- Suggest possible narrative echoes across Scripture

The goal is clarity, not authority.

---

## How It Works (Planned Architecture)

1. **Input** – User provides passage text.
2. **Analysis** – A local LLM extracts structured data (verses, nodes, edges, keywords).
3. **Normalization** – The backend validates and cleans model output.
4. **Visualization** – The frontend renders:
   - Flow diagrams
   - Verse summaries
   - Keyword threads
   - (Future) Parallel story mapping

All LLM output is treated as a draft and remains fully editable.

---

## Core Features (MVP)

- Paste passage text (required)
- Verse-by-verse summaries
- Keyword extraction
- Structural graph (nodes + edges)
- Mermaid-based diagram rendering
- Manual editing of keywords and relationships

---

## Paste-Text-Only (Licensing + Translation Variance)

Remez requires users to paste the passage text themselves. The app does not fetch or supply Bible text in order to avoid licensing issues and to support analysis of any translation or language.

Structural patterns can vary by translation because wording and word order change. Comparing translations often helps reveal repeated phrases and pivots. The strongest structural work comes from the Hebrew/Greek text, but meaningful insights are still possible from good translations.

## Planned Features

- Remez Mode: Suggest narrative or thematic parallels in the New Testament
- Keyword thread highlighting across verses
- Intertextual graph visualization
- Project saving and export
- Optional BYOK (Bring Your Own Key) model support
- Local Ollama model support

---

## Technology Stack (Planned)

Backend:
- FastAPI
- SQLite
- Ollama (local LLM)

Frontend:
- React (Vite)
- Mermaid for diagram rendering

---

## Philosophy

Remez treats AI as an assistant for structural observation, not as an interpretive authority.

All outputs are:
- Structured
- Constrained
- Editable
- Transparent

The user remains the reader and interpreter.

---

## Status

🚧 Early concept phase — no implementation yet.

---

## License

TBD
