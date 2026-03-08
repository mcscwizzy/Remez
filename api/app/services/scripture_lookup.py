from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, Tuple


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "asv.json"


class ScriptureLookupError(Exception):
    def __init__(self, status_code: int, error: str, details: str | None = None) -> None:
        super().__init__(error)
        self.status_code = status_code
        self.error = error
        self.details = details


@dataclass(frozen=True)
class ParsedReference:
    book: str
    chapter: int
    verse_start: int | None = None
    verse_end: int | None = None


BOOK_ALIASES: Dict[str, str] = {
    "genesis": "Genesis",
    "gen": "Genesis",
    "ge": "Genesis",
    "gn": "Genesis",
    "exodus": "Exodus",
    "ex": "Exodus",
    "exo": "Exodus",
    "leviticus": "Leviticus",
    "lev": "Leviticus",
    "lv": "Leviticus",
    "numbers": "Numbers",
    "num": "Numbers",
    "nm": "Numbers",
    "deuteronomy": "Deuteronomy",
    "deut": "Deuteronomy",
    "dt": "Deuteronomy",
    "joshua": "Joshua",
    "josh": "Joshua",
    "jos": "Joshua",
    "judges": "Judges",
    "judg": "Judges",
    "jdg": "Judges",
    "ruth": "Ruth",
    "ru": "Ruth",
    "1 samuel": "1 Samuel",
    "1 sam": "1 Samuel",
    "1 sa": "1 Samuel",
    "2 samuel": "2 Samuel",
    "2 sam": "2 Samuel",
    "2 sa": "2 Samuel",
    "1 kings": "1 Kings",
    "1 kgs": "1 Kings",
    "1 ki": "1 Kings",
    "2 kings": "2 Kings",
    "2 kgs": "2 Kings",
    "2 ki": "2 Kings",
    "1 chronicles": "1 Chronicles",
    "1 chron": "1 Chronicles",
    "1 chr": "1 Chronicles",
    "2 chronicles": "2 Chronicles",
    "2 chron": "2 Chronicles",
    "2 chr": "2 Chronicles",
    "ezra": "Ezra",
    "ezr": "Ezra",
    "nehemiah": "Nehemiah",
    "neh": "Nehemiah",
    "esther": "Esther",
    "est": "Esther",
    "job": "Job",
    "psalm": "Psalm",
    "psalms": "Psalm",
    "ps": "Psalm",
    "psa": "Psalm",
    "proverbs": "Proverbs",
    "prov": "Proverbs",
    "pr": "Proverbs",
    "ecclesiastes": "Ecclesiastes",
    "eccl": "Ecclesiastes",
    "ecc": "Ecclesiastes",
    "song of solomon": "Song of Solomon",
    "song of songs": "Song of Solomon",
    "song": "Song of Solomon",
    "canticles": "Song of Solomon",
    "isaiah": "Isaiah",
    "isa": "Isaiah",
    "jeremiah": "Jeremiah",
    "jer": "Jeremiah",
    "lamentations": "Lamentations",
    "lam": "Lamentations",
    "ezekiel": "Ezekiel",
    "ezek": "Ezekiel",
    "daniel": "Daniel",
    "dan": "Daniel",
    "hosea": "Hosea",
    "hos": "Hosea",
    "joel": "Joel",
    "amos": "Amos",
    "obadiah": "Obadiah",
    "obad": "Obadiah",
    "jonah": "Jonah",
    "jon": "Jonah",
    "micah": "Micah",
    "mic": "Micah",
    "nahum": "Nahum",
    "nah": "Nahum",
    "habakkuk": "Habakkuk",
    "hab": "Habakkuk",
    "zephaniah": "Zephaniah",
    "zeph": "Zephaniah",
    "haggai": "Haggai",
    "hag": "Haggai",
    "zechariah": "Zechariah",
    "zech": "Zechariah",
    "malachi": "Malachi",
    "mal": "Malachi",
    "matthew": "Matthew",
    "matt": "Matthew",
    "mt": "Matthew",
    "mark": "Mark",
    "mrk": "Mark",
    "mk": "Mark",
    "luke": "Luke",
    "luk": "Luke",
    "lk": "Luke",
    "john": "John",
    "jn": "John",
    "acts": "Acts",
    "ac": "Acts",
    "romans": "Romans",
    "rom": "Romans",
    "1 corinthians": "1 Corinthians",
    "1 cor": "1 Corinthians",
    "1 co": "1 Corinthians",
    "2 corinthians": "2 Corinthians",
    "2 cor": "2 Corinthians",
    "2 co": "2 Corinthians",
    "galatians": "Galatians",
    "gal": "Galatians",
    "ephesians": "Ephesians",
    "eph": "Ephesians",
    "philippians": "Philippians",
    "phil": "Philippians",
    "philip": "Philippians",
    "colossians": "Colossians",
    "col": "Colossians",
    "1 thessalonians": "1 Thessalonians",
    "1 thess": "1 Thessalonians",
    "1 th": "1 Thessalonians",
    "2 thessalonians": "2 Thessalonians",
    "2 thess": "2 Thessalonians",
    "2 th": "2 Thessalonians",
    "1 timothy": "1 Timothy",
    "1 tim": "1 Timothy",
    "2 timothy": "2 Timothy",
    "2 tim": "2 Timothy",
    "titus": "Titus",
    "philemon": "Philemon",
    "phlm": "Philemon",
    "hebrews": "Hebrews",
    "heb": "Hebrews",
    "james": "James",
    "jas": "James",
    "1 peter": "1 Peter",
    "1 pet": "1 Peter",
    "2 peter": "2 Peter",
    "2 pet": "2 Peter",
    "1 john": "1 John",
    "1 jn": "1 John",
    "2 john": "2 John",
    "2 jn": "2 John",
    "3 john": "3 John",
    "3 jn": "3 John",
    "jude": "Jude",
    "revelation": "Revelation",
    "rev": "Revelation",
}


def _normalize_book_key(value: str) -> str:
    cleaned = value.lower().replace(".", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


@lru_cache(maxsize=1)
def _load_asv() -> Dict[str, Dict[str, Dict[str, str]]]:
    if not DATA_PATH.exists():
        raise ScriptureLookupError(
            status_code=500,
            error="ASV source missing",
            details=f"ASV data file not found at {DATA_PATH}",
        )
    with DATA_PATH.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    if not isinstance(payload, dict):
        raise ScriptureLookupError(
            status_code=500,
            error="ASV source malformed",
            details="ASV data file must be a JSON object keyed by book name.",
        )
    return payload


def parse_reference(reference: str) -> ParsedReference:
    if not reference or not reference.strip():
        raise ScriptureLookupError(status_code=400, error="Invalid reference", details="Reference is required.")

    normalized = reference.strip()
    normalized = re.sub(r"(\d)([A-Za-z])", r"\1 \2", normalized)
    normalized = re.sub(r"\s+", " ", normalized)

    tokens = normalized.split(" ")
    book_key = None
    book_name = None
    chapter_part = None

    for i in range(len(tokens), 0, -1):
        candidate = _normalize_book_key(" ".join(tokens[:i]))
        if candidate in BOOK_ALIASES:
            book_key = candidate
            book_name = BOOK_ALIASES[candidate]
            chapter_part = " ".join(tokens[i:]).strip()
            break

    if not book_name or chapter_part is None:
        raise ScriptureLookupError(
            status_code=400,
            error="Invalid reference",
            details="Book name not recognized.",
        )

    if not chapter_part:
        raise ScriptureLookupError(
            status_code=400,
            error="Unsupported reference format",
            details="Chapter is required (e.g., Genesis 1).",
        )

    chapter_part = re.sub(r"\s+", "", chapter_part)
    match = re.match(r"^(?P<chapter>\d+)(?::(?P<verse>\d+)(?:-(?P<verse_end>\d+))?)?$", chapter_part)
    if not match:
        raise ScriptureLookupError(
            status_code=400,
            error="Unsupported reference format",
            details="Use formats like Genesis 1 or Philippians 2:6-11.",
        )

    chapter = int(match.group("chapter"))
    verse_start = match.group("verse")
    verse_end = match.group("verse_end")

    verse_start_int = int(verse_start) if verse_start else None
    verse_end_int = int(verse_end) if verse_end else None

    if verse_end_int is not None and verse_start_int is not None and verse_end_int < verse_start_int:
        raise ScriptureLookupError(
            status_code=400,
            error="Invalid reference",
            details="Verse range end must be after the start verse.",
        )

    return ParsedReference(
        book=book_name,
        chapter=chapter,
        verse_start=verse_start_int,
        verse_end=verse_end_int,
    )


def _get_chapter_verses(data: Dict[str, Dict[str, Dict[str, str]]], ref: ParsedReference) -> Dict[int, str]:
    book = data.get(ref.book)
    if not isinstance(book, dict):
        raise ScriptureLookupError(
            status_code=404,
            error="Reference not found in local ASV source.",
            details="Book not found in ASV dataset.",
        )
    chapter = book.get(str(ref.chapter))
    if not isinstance(chapter, dict):
        raise ScriptureLookupError(
            status_code=404,
            error="Reference not found in local ASV source.",
            details="Chapter not found in ASV dataset.",
        )

    verses: Dict[int, str] = {}
    for key, text in chapter.items():
        try:
            verse_num = int(key)
        except (TypeError, ValueError):
            continue
        if not isinstance(text, str):
            continue
        verses[verse_num] = text

    if not verses:
        raise ScriptureLookupError(
            status_code=404,
            error="Reference not found in local ASV source.",
            details="No verses found for this chapter.",
        )

    return verses


def get_passage_metadata(reference: str) -> Dict[str, int | str | None]:
    ref = parse_reference(reference)
    data = _load_asv()
    verses = _get_chapter_verses(data, ref)

    ordered = sorted(verses.keys())
    start = ref.verse_start or ordered[0]
    end = ref.verse_end or (ref.verse_start or ordered[-1])

    if start not in verses or end not in verses:
        raise ScriptureLookupError(
            status_code=404,
            error="Reference not found in local ASV source.",
            details="Verse not found in ASV dataset.",
        )

    if ref.verse_start is not None and ref.verse_end is None:
        formatted_ref = f"{ref.book} {ref.chapter}:{ref.verse_start}"
    elif ref.verse_start is not None and ref.verse_end is not None:
        formatted_ref = f"{ref.book} {ref.chapter}:{ref.verse_start}-{ref.verse_end}"
    else:
        formatted_ref = f"{ref.book} {ref.chapter}"

    return {
        "book": ref.book,
        "chapter": ref.chapter,
        "verse_start": start,
        "verse_end": end,
        "reference": formatted_ref,
        "verse_count": end - start + 1,
    }


def get_passage_asv(reference: str) -> str:
    ref = parse_reference(reference)
    data = _load_asv()
    verses = _get_chapter_verses(data, ref)
    ordered = sorted(verses.keys())

    start = ref.verse_start or ordered[0]
    end = ref.verse_end or (ref.verse_start or ordered[-1])

    if start not in verses or end not in verses:
        raise ScriptureLookupError(
            status_code=404,
            error="Reference not found in local ASV source.",
            details="Verse not found in ASV dataset.",
        )

    selected = [v for v in ordered if start <= v <= end]
    if not selected:
        raise ScriptureLookupError(
            status_code=404,
            error="Reference not found in local ASV source.",
            details="No verses found for this reference.",
        )

    lines = [f"{num}. {verses[num]}" for num in selected]
    return "\n".join(lines)


def format_reference(metadata: Dict[str, int | str | None]) -> str:
    return str(metadata.get("reference") or "")


def get_passage_and_metadata(reference: str) -> Tuple[str, Dict[str, int | str | None]]:
    metadata = get_passage_metadata(reference)
    passage = get_passage_asv(reference)
    return passage, metadata
