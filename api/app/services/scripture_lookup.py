from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger("remez")

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "asv"
INDEX_FILE = DATA_DIR / "index.json"


class ScriptureLookupError(Exception):
    def __init__(self, status_code: int, error: str, details: str | None = None) -> None:
        super().__init__(error)
        self.status_code = status_code
        self.error = error
        self.details = details


@dataclass(frozen=True)
class ParsedReference:
    book_id: str
    book_name: str
    chapter_start: int
    chapter_end: int
    verse_start: int | None
    verse_end: int | None
    kind: str


_BOOK_CACHE: Dict[str, Dict[str, Any]] = {}


def _normalize_book_token(value: str) -> str:
    cleaned = value.lower().replace(".", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned.replace(" ", "")


@lru_cache(maxsize=1)
def load_asv_index() -> Dict[str, Any]:
    if not INDEX_FILE.exists():
        raise ScriptureLookupError(
            status_code=500,
            error="ASV index missing",
            details=f"Index file not found at {INDEX_FILE}",
        )
    try:
        payload = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ScriptureLookupError(
            status_code=500,
            error="ASV index malformed",
            details=str(exc),
        ) from exc

    if not isinstance(payload, dict) or "books" not in payload:
        raise ScriptureLookupError(
            status_code=500,
            error="ASV index malformed",
            details="Index JSON must contain a 'books' array.",
        )

    books = payload.get("books")
    if not isinstance(books, list) or len(books) < 66:
        raise ScriptureLookupError(
            status_code=500,
            error="ASV index malformed",
            details="Index JSON must contain 66 books.",
        )

    lookup: Dict[str, Dict[str, Any]] = {}
    for item in books:
        if not isinstance(item, dict):
            continue
        book_id = str(item.get("id", "")).strip().upper()
        book_name = str(item.get("name", "")).strip()
        if not book_id or not book_name:
            continue
        tokens = [book_id, book_name]
        abbrev = item.get("abbrev") or []
        if isinstance(abbrev, list):
            tokens.extend([str(a) for a in abbrev if a])
        for token in tokens:
            key = _normalize_book_token(token)
            if key:
                lookup[key] = item

    payload["_lookup"] = lookup
    return payload


def load_book(book_id_or_name: str) -> Dict[str, Any]:
    index = load_asv_index()
    lookup = index.get("_lookup") or {}
    token = _normalize_book_token(book_id_or_name)
    book_info = lookup.get(token)
    if not book_info:
        raise ScriptureLookupError(
            status_code=400,
            error="Unknown book abbreviation",
            details=f"Book not recognized: {book_id_or_name}",
        )

    book_id = str(book_info.get("id", "")).strip().upper()
    if book_id in _BOOK_CACHE:
        logger.info("asv_book_cache_hit", extra={"book_id": book_id, "book_name": book_info.get("name")})
        return _BOOK_CACHE[book_id]

    file_name = str(book_info.get("file", "")).strip()
    if not file_name:
        raise ScriptureLookupError(
            status_code=500,
            error="ASV index malformed",
            details=f"Missing file name for {book_id}",
        )

    file_path = DATA_DIR / file_name
    if not file_path.exists():
        raise ScriptureLookupError(
            status_code=500,
            error="ASV book file missing",
            details=f"Missing ASV book file: {file_name}",
        )

    try:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ScriptureLookupError(
            status_code=500,
            error="ASV book file malformed",
            details=str(exc),
        ) from exc

    if not isinstance(payload, dict) or "chapters" not in payload:
        raise ScriptureLookupError(
            status_code=500,
            error="ASV book file malformed",
            details=f"Book file {file_name} is missing chapters.",
        )

    _BOOK_CACHE[book_id] = payload
    logger.info("asv_book_loaded", extra={"book_id": book_id, "book_name": book_info.get("name"), "file": file_name})
    return payload


def parse_reference(reference: str) -> ParsedReference:
    if not reference or not reference.strip():
        raise ScriptureLookupError(status_code=400, error="Invalid reference format", details="Reference is required.")

    raw = reference.strip()
    match = re.match(r"^\s*(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?\s*$", raw)
    if not match:
        raise ScriptureLookupError(
            status_code=400,
            error="Invalid reference format",
            details="Use formats like Genesis 1 or Philippians 2:6-11.",
        )

    book_part = match.group(1)
    chapter = int(match.group(2))
    verse_start = int(match.group(3)) if match.group(3) else None
    verse_end = int(match.group(4)) if match.group(4) else None

    index = load_asv_index()
    lookup = index.get("_lookup") or {}
    book_key = _normalize_book_token(book_part)
    book_info = lookup.get(book_key)
    if not book_info:
        raise ScriptureLookupError(
            status_code=400,
            error="Unknown book abbreviation",
            details=f"Book not recognized: {book_part}",
        )

    if verse_end is not None and verse_start is not None and verse_end < verse_start:
        raise ScriptureLookupError(
            status_code=400,
            error="Invalid reference format",
            details="Verse range end must be after the start verse.",
        )

    kind = "chapter"
    if verse_start is not None and verse_end is None:
        kind = "single_verse"
    elif verse_start is not None and verse_end is not None:
        kind = "verse_range"

    parsed = ParsedReference(
        book_id=str(book_info.get("id")).upper(),
        book_name=str(book_info.get("name")),
        chapter_start=chapter,
        chapter_end=chapter,
        verse_start=verse_start,
        verse_end=verse_end,
        kind=kind,
    )

    logger.info(
        "asv_reference_parsed",
        extra={
            "reference_raw": raw,
            "reference_normalized": format_reference(parsed),
            "book_id": parsed.book_id,
            "chapter": parsed.chapter_start,
            "verse_start": parsed.verse_start,
            "verse_end": parsed.verse_end,
            "kind": parsed.kind,
        },
    )

    return parsed


def format_reference(parsed: ParsedReference) -> str:
    if parsed.kind == "chapter":
        return f"{parsed.book_name} {parsed.chapter_start}"
    if parsed.kind == "single_verse":
        return f"{parsed.book_name} {parsed.chapter_start}:{parsed.verse_start}"
    return f"{parsed.book_name} {parsed.chapter_start}:{parsed.verse_start}-{parsed.verse_end}"


def _get_chapter(book_payload: Dict[str, Any], chapter: int) -> List[str]:
    chapters = book_payload.get("chapters")
    if not isinstance(chapters, list):
        raise ScriptureLookupError(
            status_code=500,
            error="ASV book file malformed",
            details="Chapters must be an array.",
        )
    if chapter < 1 or chapter > len(chapters):
        raise ScriptureLookupError(
            status_code=400,
            error="Chapter out of range",
            details=f"Chapter {chapter} is out of range.",
        )
    chapter_data = chapters[chapter - 1]
    if not isinstance(chapter_data, list):
        raise ScriptureLookupError(
            status_code=500,
            error="ASV book file malformed",
            details="Chapter data must be an array of verses.",
        )
    return chapter_data


def get_passage_asv(reference: str) -> Dict[str, Any]:
    parsed = parse_reference(reference)
    book_payload = load_book(parsed.book_id)
    chapter_data = _get_chapter(book_payload, parsed.chapter_start)

    if not chapter_data:
        raise ScriptureLookupError(
            status_code=500,
            error="ASV book file malformed",
            details="Chapter data missing verses.",
        )

    verse_start = parsed.verse_start or 1
    verse_end = parsed.verse_end or (parsed.verse_start or len(chapter_data))

    if verse_start < 1 or verse_start > len(chapter_data):
        raise ScriptureLookupError(
            status_code=400,
            error="Verse out of range",
            details=f"Verse {verse_start} is out of range.",
        )
    if verse_end < 1 or verse_end > len(chapter_data):
        raise ScriptureLookupError(
            status_code=400,
            error="Verse out of range",
            details=f"Verse {verse_end} is out of range.",
        )

    if parsed.verse_start is not None and parsed.verse_end is None:
        verse_end = verse_start

    if verse_end < verse_start:
        raise ScriptureLookupError(
            status_code=400,
            error="Invalid reference format",
            details="Verse range end must be after the start verse.",
        )

    selected = chapter_data[verse_start - 1 : verse_end]
    if not selected:
        raise ScriptureLookupError(
            status_code=400,
            error="Verse out of range",
            details="No verses found for this reference.",
        )

    lines = [f"{i + verse_start} {text}" for i, text in enumerate(selected)]
    text = "\n".join(lines)

    logger.info(
        "asv_passage_loaded",
        extra={
            "reference_normalized": format_reference(parsed),
            "book_id": parsed.book_id,
            "chapter": parsed.chapter_start,
            "verse_start": verse_start,
            "verse_end": verse_end,
            "verse_count": len(selected),
        },
    )

    return {
        "reference": format_reference(parsed),
        "source_translation": "ASV",
        "source_mode": "reference",
        "text": text,
    }


def get_passage_metadata(reference: str) -> Dict[str, Any]:
    parsed = parse_reference(reference)
    book_payload = load_book(parsed.book_id)
    chapters = book_payload.get("chapters")
    chapter_count = len(chapters) if isinstance(chapters, list) else 0

    verse_start = parsed.verse_start or 1
    verse_end = parsed.verse_end or (parsed.verse_start or 1)
    if parsed.verse_start is None:
        chapter_data = _get_chapter(book_payload, parsed.chapter_start)
        verse_end = len(chapter_data)

    verse_count = max(0, verse_end - verse_start + 1)

    return {
        "reference": format_reference(parsed),
        "book_name": parsed.book_name,
        "translation": "ASV",
        "chapter_count": 1,
        "verse_count": verse_count,
        "book_chapter_count": chapter_count,
    }


def validate_asv_corpus() -> List[str]:
    errors: List[str] = []
    try:
        index = load_asv_index()
    except ScriptureLookupError as exc:
        return [f"index: {exc.error} ({exc.details})"]

    books = index.get("books") or []
    if len(books) != 66:
        errors.append(f"index: expected 66 books, found {len(books)}")

    for item in books:
        if not isinstance(item, dict):
            errors.append("index: non-object book entry")
            continue
        book_id = str(item.get("id", "")).strip().upper()
        file_name = str(item.get("file", "")).strip()
        chapter_count = item.get("chapter_count")
        if not book_id or not file_name:
            errors.append(f"index: missing id/file for {item}")
            continue
        file_path = DATA_DIR / file_name
        if not file_path.exists():
            errors.append(f"missing book file: {file_name}")
            continue
        try:
            payload = json.loads(file_path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"malformed book file {file_name}: {exc}")
            continue
        chapters = payload.get("chapters") if isinstance(payload, dict) else None
        if not isinstance(chapters, list):
            errors.append(f"book file {file_name} missing chapters array")
            continue
        if isinstance(chapter_count, int) and chapter_count != len(chapters):
            errors.append(
                f"book file {file_name} chapter_count mismatch: index {chapter_count} vs file {len(chapters)}"
            )
        for idx, chap in enumerate(chapters, start=1):
            if not isinstance(chap, list):
                errors.append(f"book file {file_name} chapter {idx} not an array")
                break

    return errors
