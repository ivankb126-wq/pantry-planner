"""Load and validate data/ingredients.yml."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

UNITS = {"g", "ml", "piece"}
STORAGE = {"fridge", "shelves", "freezer"}
PACKAGE_TYPES = {"jar", "box", "bag", "bottle", "can", "pack", "loose", "carton", "tube"}
DIETS = ("vegan", "vegetarian", "pescatarian", "meat")
NUTRIENTS = ("kcal", "protein", "carbs", "sugar", "fat", "sat_fat", "fibre", "salt")
CATEGORIES = {
    "fruit-veg",
    "meat",
    "fish",
    "dairy",
    "eggs",
    "bakery",
    "grains",
    "legumes",
    "canned",
    "sauces",
    "oils",
    "spices",
    "baking",
    "nuts",
    "frozen",
    "sweets",
    "drinks",
}


@dataclass
class Ingredient:
    id: str
    name: str
    category: str
    storage: str
    unit: str
    staple: bool
    package_type: str
    nutrition: dict[str, float]
    include: list[str]
    exclude: list[str] = field(default_factory=list)
    packages: list[float] = field(default_factory=list)
    piece_g: float | None = None
    density: float = 1.0
    shelf_life_days: int | None = None
    loose_ok: bool = False
    tags: list[str] = field(default_factory=list)
    allow: list[str] = field(default_factory=list)  # exclude groups that do not apply
    diet: str = "vegan"  # strictest diet it fits: vegan, vegetarian, pescatarian, meat
    edible: float = 1.0  # part you eat (no bones, shells, peel)
    dried: bool = False  # dried only: skip tins and jars (two weights, "LIM", "OM"...)

    def to_public(self) -> dict:
        """The fields the web app needs (no matching rules)."""
        out = {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "storage": self.storage,
            "unit": self.unit,
            "staple": self.staple,
            "packageType": self.package_type,
            "packages": self.packages,
            "nutrition": self.nutrition,
            "diet": self.diet,
        }
        if self.density != 1.0:
            out["density"] = self.density
        if self.edible != 1.0:
            out["edible"] = self.edible
        if self.piece_g:
            out["pieceG"] = self.piece_g
        if self.shelf_life_days:
            out["shelfLifeDays"] = self.shelf_life_days
        if self.tags:
            out["tags"] = self.tags
        return out


class IngredientError(ValueError):
    pass


def load_ingredients(path: Path) -> tuple[list[Ingredient], dict]:
    """Return (ingredients, settings). Raises IngredientError listing every problem."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    settings = raw.get("settings", {})
    items = raw.get("ingredients", [])
    problems: list[str] = []
    seen: set[str] = set()
    result: list[Ingredient] = []
    for i, item in enumerate(items):
        where = f"entry {i + 1} ({item.get('id', '?')})"
        try:
            ing = _parse(item)
        except (KeyError, TypeError, ValueError) as err:
            problems.append(f"{where}: {err}")
            continue
        if ing.id in seen:
            problems.append(f"{where}: duplicate id")
        seen.add(ing.id)
        problems.extend(f"{where}: {p}" for p in _check(ing))
        result.append(ing)
    if problems:
        raise IngredientError("ingredients.yml has problems:\n  " + "\n  ".join(problems))
    return result, settings


def _parse(item: dict) -> Ingredient:
    match = item.get("match") or {}
    return Ingredient(
        id=str(item["id"]),
        name=str(item["name"]),
        category=str(item["category"]),
        storage=str(item["storage"]),
        unit=str(item["unit"]),
        staple=bool(item.get("staple", False)),
        package_type=str(item.get("package", "pack")),
        nutrition={k: float(v) for k, v in item["nutrition"].items()},
        include=[str(x) for x in match.get("include", [])],
        exclude=[str(x) for x in match.get("exclude", [])],
        packages=[float(x) for x in item.get("packages", [])],
        piece_g=float(item["piece_g"]) if item.get("piece_g") else None,
        density=float(item.get("density", 1.0)),
        shelf_life_days=int(item["shelf_life_days"]) if item.get("shelf_life_days") else None,
        loose_ok=bool(item.get("loose", False)),
        tags=[str(x) for x in item.get("tags", [])],
        allow=[str(x) for x in match.get("allow", [])],
        diet=str(item.get("diet", "vegan")),
        edible=float(item.get("edible", 1.0)),
        dried=bool(match.get("dried", False)),
    )


def _check(ing: Ingredient) -> list[str]:
    p: list[str] = []
    if ing.unit not in UNITS:
        p.append(f"unit must be one of {sorted(UNITS)}")
    if ing.storage not in STORAGE:
        p.append(f"storage must be one of {sorted(STORAGE)}")
    if ing.category not in CATEGORIES:
        p.append(f"category must be one of {sorted(CATEGORIES)}")
    if ing.package_type not in PACKAGE_TYPES:
        p.append(f"package must be one of {sorted(PACKAGE_TYPES)}")
    missing = [n for n in NUTRIENTS if n not in ing.nutrition]
    if missing:
        p.append(f"nutrition is missing {missing}")
    n = ing.nutrition
    if all(k in n for k in ("protein", "carbs", "fat", "kcal")):
        # Energy from macros should roughly agree with kcal (4/4/9 rule, fibre 2).
        est = 4 * n["protein"] + 4 * n["carbs"] + 9 * n["fat"] + 2 * n.get("fibre", 0) + 7 * n.get("alcohol", 0)
        if n["kcal"] > 40 and abs(est - n["kcal"]) > max(40, 0.25 * n["kcal"]):
            p.append(f"kcal {n['kcal']} does not fit the macros (about {est:.0f})")
    if n.get("sugar", 0) > n.get("carbs", 0) + 0.01:
        p.append("sugar is higher than carbs")
    if n.get("sat_fat", 0) > n.get("fat", 0) + 0.01:
        p.append("sat_fat is higher than fat")
    if ing.diet not in DIETS:
        p.append(f"diet must be one of {DIETS}")
    if not ing.include:
        p.append("match.include is empty")
    if ing.unit == "piece" and not ing.piece_g:
        p.append("piece ingredients need piece_g (weight of one piece)")
    return p
