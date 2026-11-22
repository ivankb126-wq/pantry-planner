"""Match store products to recipe ingredients and pick the best value options.

Keyword rules (in data/ingredients.yml):
  - A rule is one or more words, e.g. "PILECI FILE". Every word must appear
    in the product name, in any order. Diacritics and case are ignored.
  - A word ending in * is a prefix: "PILE*" matches PILEĆI, PILEĆA, PILEĆE.
  - include: the product matches if ANY include rule matches.
  - exclude: the product is rejected if ANY exclude rule matches.
  - settings.global_exclude in the yml rejects non-food (shampoo, pet food...).
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from statistics import median

from .ingredients import Ingredient
from .parsing import Size, fold, size_from_fields, size_from_name, tokens

# Signs that a product is cooked beans or lentils in a tin or jar, not dried:
# two weights ("400/240 g": the tin and the drained beans) or these words.
_DRAINED = re.compile(r"\d\s*(G|ML|GR)?\s*/\s*\d")
_TIN_WORDS = {
    "LIM",
    "LIMENKA",
    "LIMENCI",
    "CAN",
    "OM",
    "KUHAN",
    "KUHANA",
    "KUHANI",
    "KUHANE",
    "PARI",
    "STERILIZIRANA",
    "STERILIZIRANI",
}
# Brands that only sell beans and lentils in tins and jars (Campo, Italdoro
# and Senesi are the 400 g tins at Plodine).
_TIN_BRANDS = {"BONDUELLE", "GIANA", "CAMPO", "ITALDORO", "SENESI"}


def looks_tinned(name: str) -> bool:
    """True for "GRAH BIJELI 400/240 g", "LEĆA LIM.400g", "Leća, OM 260g"."""
    folded = fold(name)
    words = set(tokens(name))
    return bool(_DRAINED.search(folded)) or bool(words & _TIN_WORDS) or bool(words & _TIN_BRANDS)


class Rule:
    __slots__ = ("words", "text")

    def __init__(self, text: str):
        self.text = text
        self.words: list[tuple[str, bool]] = []
        for raw in text.split():
            prefix = raw.endswith("*")
            for t in tokens(raw.rstrip("*")):
                self.words.append((t, False))
            if prefix and self.words:
                self.words[-1] = (self.words[-1][0], True)

    def matches(self, name_tokens: list[str], name_set: set[str]) -> bool:
        for word, prefix in self.words:
            if prefix:
                if not any(t.startswith(word) for t in name_tokens):
                    return False
            elif word not in name_set:
                return False
        return True


@dataclass
class CompiledIngredient:
    ingredient: Ingredient
    include: list[Rule]
    exclude: list[Rule]


class Matcher:
    """settings (from the yml) may hold:
    global_exclude: rules that reject a product for every ingredient
    nonfood_categories: category words that reject a product
    exclude_groups: {name: rules}; applied to every ingredient unless the
                    ingredient lists the group under match.allow
    """

    def __init__(self, ingredients: list[Ingredient], settings: dict | None = None):
        settings = settings or {}
        self.items = [
            CompiledIngredient(i, [Rule(r) for r in i.include], [Rule(r) for r in i.exclude]) for i in ingredients
        ]
        self.global_exclude = [Rule(r) for r in settings.get("global_exclude", [])]
        self.nonfood_categories = [fold(c) for c in settings.get("nonfood_categories", [])]
        self.groups = {g: [Rule(r) for r in rules] for g, rules in (settings.get("exclude_groups") or {}).items()}
        # Index by the first 3 letters of every rule's first word, so each
        # product is only tested against plausible ingredients.
        self._index: dict[str, list[CompiledIngredient]] = defaultdict(list)
        self._always: list[CompiledIngredient] = []
        for ci in self.items:
            keys = {r.words[0][0][:3] for r in ci.include if r.words}
            if any(len(k) < 3 for k in keys):
                self._always.append(ci)
            for k in keys:
                if len(k) == 3:
                    self._index[k].append(ci)

    def match(self, name: str, category: str = "") -> list[Ingredient]:
        """Return the ingredients this product name fits (usually 0 or 1)."""
        if category and any(c in fold(category) for c in self.nonfood_categories):
            return []
        toks = tokens(name)
        tset = set(toks)
        if any(r.matches(toks, tset) for r in self.global_exclude):
            return []
        candidates: dict[str, CompiledIngredient] = {ci.ingredient.id: ci for ci in self._always}
        for t in toks:
            for ci in self._index.get(t[:3], ()):
                candidates[ci.ingredient.id] = ci
        found = []
        group_hits: set[str] | None = None
        for ci in candidates.values():
            if not any(r.matches(toks, tset) for r in ci.include):
                continue
            if any(r.matches(toks, tset) for r in ci.exclude):
                continue
            if ci.ingredient.dried and looks_tinned(name):
                continue
            if group_hits is None:
                group_hits = {g for g, rules in self.groups.items() if any(r.matches(toks, tset) for r in rules)}
            if group_hits - set(ci.ingredient.allow):
                continue
            found.append(ci.ingredient)
        # A dried bag of chickpeas is not also "canned chickpeas".
        if any(i.dried for i in found):
            found = [i for i in found if i.dried or i.category != "legumes"]
        return found


# ---------------------------------------------------------------------------
# Package size in the ingredient's own unit


SOLID_CATEGORIES = {
    "fruit-veg",
    "meat",
    "fish",
    "eggs",
    "bakery",
    "grains",
    "legumes",
    "spices",
    "baking",
    "nuts",
    "frozen",
    "sweets",
}


SOLD_BY_WEIGHT = {"meat", "fish", "dairy"}  # deli and fish counters


@dataclass
class PackInfo:
    amount: float  # in the ingredient's unit (g, ml or pieces)
    loose: bool  # sold by weight (price is per kg)


def pack_for(
    ing: Ingredient, name: str, quantity: str, unit: str, price: float | None = None, unit_price: float | None = None
) -> PackInfo | None:
    """Work out how much of the ingredient one package holds."""
    size = size_from_name(name)
    from_name = size is not None
    if size is None:
        size = size_from_fields(quantity, unit)
    loose = False
    if not from_name:
        u = fold(unit or "")
        # Only fresh food is really sold by weight; a "1 kg" rice price line is a 1 kg bag.
        per_kg = u.startswith("KG") and (ing.loose_ok or ing.category in SOLD_BY_WEIGHT)
        if not per_kg and ing.loose_ok and size and size.kind in {"mass", "base"} and abs(size.amount - 1000) < 1:
            # Loose produce: 1 kg and the price equals the price per kg.
            per_kg = bool(price and unit_price and abs(price - unit_price) < 0.011)
        if per_kg and (size is None or abs(size.amount - 1000) < 1):
            size = Size(1000.0, "mass")
            loose = True
    if size is None:
        return None
    # Solid foods are never sold in litres: a "1 L" apple product is juice.
    if size.kind == "volume" and ing.unit == "g" and ing.category in SOLID_CATEGORIES:
        return None
    # Cross-check against price / unit price (unit price is per kg or l).
    if not from_name and not loose and price and unit_price and size.kind in {"mass", "volume", "base"}:
        ratio_amount = price / unit_price * 1000
        if size.amount > 0 and abs(ratio_amount - size.amount) / size.amount > 0.35 and abs(price - unit_price) > 0.011:
            size = Size(ratio_amount, size.kind)
    amount = _convert(ing, size)
    if amount is None or amount <= 0:
        return None
    return PackInfo(amount=round(amount, 1), loose=loose)


def _convert(ing: Ingredient, size: Size) -> float | None:
    if ing.unit == "g":
        if size.kind in {"mass", "base"}:
            return size.amount
        if size.kind == "volume":
            return size.amount * ing.density
        if size.kind == "count" and ing.piece_g:
            return size.amount * ing.piece_g
        return None
    if ing.unit == "ml":
        if size.kind in {"volume", "base"}:
            return size.amount
        if size.kind == "mass":
            return size.amount / ing.density
        return None
    # pieces
    if size.kind == "count":
        return size.amount
    if size.kind in {"mass", "base"} and ing.piece_g:
        return size.amount / ing.piece_g
    return None


# ---------------------------------------------------------------------------
# Picking best value options per ingredient in one store


@dataclass
class Offer:
    ingredient_id: str
    product_id: str
    name: str
    brand: str
    barcode: str
    amount: float
    loose: bool
    price: float
    special_price: float | None
    best_price_30: float | None
    anchor_price: float | None

    @property
    def unit_value(self) -> float:
        """EUR per kg, per l or per piece."""
        per = 1 if self._is_piece else 1000
        return self.price / self.amount * per

    _is_piece: bool = False

    def to_json(self, unit: str) -> dict:
        out = {
            "ingredient": self.ingredient_id,
            "name": self.name,
            "brand": self.brand or None,
            "barcode": self.barcode or None,
            "size": self.amount,
            "unit": unit,
            "price": round(self.price, 2),
            "salePrice": round(self.special_price, 2) if self.special_price else None,
            "unitPrice": round(self.unit_value, 2),
            "best30": round(self.best_price_30, 2) if self.best_price_30 else None,
            "anchor": round(self.anchor_price, 2) if self.anchor_price else None,
        }
        if self.loose:
            out["loose"] = True
        return out


def pick_options(ing: Ingredient, offers: list[Offer], keep: int = 3) -> list[Offer]:
    """Best value options: lowest price per kg/l/piece among sensible package
    sizes, plus the cheapest single package if it is not already included."""
    if not offers:
        return []
    for o in offers:
        o._is_piece = ing.unit == "piece"
    # One entry per (barcode, name): Lidl lists some products several times.
    unique: dict[tuple[str, str], Offer] = {}
    for o in offers:
        key = (o.barcode or o.product_id, fold(o.name))
        if key not in unique or o.price < unique[key].price:
            unique[key] = o
    items = list(unique.values())
    # Drop suspicious unit prices (usually a misread package size).
    if len(items) >= 4:
        med = median(o.unit_value for o in items)
        items = [o for o in items if 0.3 * med <= o.unit_value <= 6 * med]
    lo, hi = _sensible_range(ing)

    def sensible(o: Offer) -> bool:
        return o.loose or lo <= o.amount <= hi

    ranked = sorted(items, key=lambda o: (o.unit_value * (1.0 if sensible(o) else 1.6), o.price))
    chosen = ranked[:keep]
    cheapest = min(items, key=lambda o: (o.price, o.unit_value))
    if cheapest not in chosen:
        chosen.append(cheapest)
    return chosen


def _sensible_range(ing: Ingredient) -> tuple[float, float]:
    if not ing.packages:
        return (0.0, float("inf"))
    return (min(ing.packages) / 3, max(ing.packages) * 3)
