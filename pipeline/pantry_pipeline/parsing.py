"""Parsing helpers for Croatian price list data: text, numbers, package sizes."""

from __future__ import annotations

import re
from dataclasses import dataclass

_DIACRITICS = str.maketrans(
    {
        "Č": "C",
        "Ć": "C",
        "Š": "S",
        "Ž": "Z",
        "Đ": "DJ",
        "č": "c",
        "ć": "c",
        "š": "s",
        "ž": "z",
        "đ": "dj",
        "Ä": "A",
        "Ö": "O",
        "Ü": "U",
        "ä": "a",
        "ö": "o",
        "ü": "u",
        "É": "E",
        "È": "E",
        "é": "e",
        "è": "e",
        "×": "X",
    }
)


def fold(text: str) -> str:
    """Uppercase and remove Croatian diacritics: 'Pileći file' -> 'PILECI FILE'."""
    return text.translate(_DIACRITICS).upper()


_NON_WORD = re.compile(r"[^A-Z0-9]+")


def tokens(text: str) -> list[str]:
    """Split a product name into searchable words. Dots and slashes split words,
    so abbreviations like 'SVJ.JAJA' become ['SVJ', 'JAJA']."""
    return [t for t in _NON_WORD.split(fold(text)) if t]


def parse_decimal(value: str | None) -> float | None:
    """Parse '1,99', '1.99', ' 1 234,50 ', '' -> float or None."""
    if value is None:
        return None
    v = value.strip().replace(" ", "").replace(" ", "").replace("€", "")
    if not v:
        return None
    if "," in v and "." in v:
        # '1.234,50' -> thousands dot, decimal comma
        if v.rfind(",") > v.rfind("."):
            v = v.replace(".", "").replace(",", ".")
        else:
            v = v.replace(",", "")
    else:
        v = v.replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None


@dataclass(frozen=True)
class Size:
    """A package size. kind is 'mass' (amount in g), 'volume' (ml),
    'count' (pieces) or 'base' (kg or l, unknown which; amount in g/ml)."""

    amount: float
    kind: str


_UNIT_FACTORS = {
    "KG": (1000.0, "mass"),
    "G": (1.0, "mass"),
    "GR": (1.0, "mass"),
    "DAG": (10.0, "mass"),
    "L": (1000.0, "volume"),
    "LIT": (1000.0, "volume"),
    "DL": (100.0, "volume"),
    "DCL": (100.0, "volume"),
    "CL": (10.0, "volume"),
    "ML": (1.0, "volume"),
}

_NUM = r"(\d+(?:[.,]\d+)?)"
_UNIT = r"(KG|GR|G|DAG|LIT|L|DCL|DL|CL|ML)"
# A number must not continue another number ("1.5" is one number) but may
# follow an abbreviation dot: "DELIK.670 g" is 670 g.
_START = r"(?<![A-Z\d])(?<!\d[.,])"
_MULTI = re.compile(rf"{_START}(\d+)\s*X\s*{_NUM}\s*{_UNIT}(?![A-Z])")
_MULTI_REV = re.compile(rf"{_START}{_NUM}\s*{_UNIT}\s*X\s*(\d+)(?![\d.,])")
_SIMPLE = re.compile(rf"{_START}{_NUM}\s*{_UNIT}(?![A-Z])")
_PIECES = re.compile(rf"{_START}(\d+)\s*/\s*1(?![\d.,])|{_START}(\d+)\s*(?:KOM|KOMADA|KOMA)(?![A-Z])")


def _num(s: str) -> float:
    return float(s.replace(",", "."))


def size_from_name(name: str) -> Size | None:
    """Find the package size written in a product name.

    'PILEĆI FILE 500 g' -> 500 g; 'Jogurt 4x125g' -> 500 g;
    'VODA 0,5 L' -> 500 ml; 'JAJA M 10/1' -> 10 pieces.
    """
    text = fold(name)
    m = _MULTI.search(text)
    if m:
        count, amount, unit = int(m.group(1)), _num(m.group(2)), m.group(3)
        factor, kind = _UNIT_FACTORS[unit]
        if 1 < count <= 48:
            return Size(count * amount * factor, kind)
    m = _MULTI_REV.search(text)
    if m:
        amount, unit, count = _num(m.group(1)), m.group(2), int(m.group(3))
        factor, kind = _UNIT_FACTORS[unit]
        if 1 < count <= 48:
            return Size(count * amount * factor, kind)
    m = _SIMPLE.search(text)
    if m:
        amount, unit = _num(m.group(1)), m.group(2)
        factor, kind = _UNIT_FACTORS[unit]
        if amount > 0:
            return Size(amount * factor, kind)
    m = _PIECES.search(text)
    if m:
        count = int(m.group(1) or m.group(2))
        if 1 <= count <= 360:
            return Size(float(count), "count")
    return None


_QTY_WITH_UNIT = re.compile(rf"^\s*{_NUM}\s*{_UNIT}\s*$")


def size_from_fields(quantity: str, unit: str) -> Size | None:
    """Interpret the quantity/unit columns, which differ per chain:

    Spar:      unit 'kg' / 'L' / 'kom', quantity '0,2500'
    Lidl:      unit 'g (1kg)' / 'ml (1 L)', quantity '0.34' (in kg or l)
    Kaufland:  unit 'KOM' / 'KG', quantity '0,460' (in kg or l)
    Konzum:    unit 'ko', quantity '0.20 kg'
    Plodine:   unit 'KOM', quantity '0,500 L'
    """
    q = (quantity or "").strip()
    u = fold(unit or "").strip()
    if not q:
        return None
    m = _QTY_WITH_UNIT.match(fold(q))
    if m:
        factor, kind = _UNIT_FACTORS[m.group(2)]
        amount = _num(m.group(1)) * factor
        return Size(amount, kind) if amount > 0 else None
    value = parse_decimal(q)
    if value is None or value <= 0:
        return None
    if u.startswith("KG") or u.startswith("G ") or u.startswith("G("):
        return Size(value * 1000, "mass")
    if u in {"L", "LIT"} or u.startswith("ML") or u.startswith("L "):
        return Size(value * 1000, "volume")
    if u in {"G", "GR"}:
        return Size(value, "mass")
    if u == "ML":
        return Size(value, "volume")
    if u.startswith("KOM") or u in {"KO", "PAK", "KUT"}:
        # Kaufland puts the weight/volume in kg/l under 'KOM' ('0,460');
        # whole numbers are piece counts.
        if value != int(value):
            return Size(value * 1000, "base")
        return Size(value, "count")
    return None
