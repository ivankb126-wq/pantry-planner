"""Where each store is, for "stores near me" in the app.

The price lists give a store's street address but no map position. This
matches each store to a shop of the same chain on OpenStreetMap (same street
and house number, or the same street, or the only shop of that chain in a
small town). When nothing matches, the store gets its town's position, which
is still good enough to sort stores by distance.

Run now and then (stores rarely move): it writes data/store-locations.json,
which the build adds to the store lists as lat/lon.
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

OVERPASS = "https://overpass-api.de/api/interpreter"
USER_AGENT = "PantryPlannerStores/1.0 (personal recipe app)"

SHOPS_QUERY = """[out:json][timeout:180];
area["ISO3166-1"="HR"][admin_level=2]->.hr;
(
  nwr["shop"]["brand"~"Konzum|Lidl|Kaufland|Spar|Interspar|Plodine",i](area.hr);
  nwr["shop"]["name"~"Konzum|Lidl|Kaufland|Spar|Plodine",i](area.hr);
);
out center tags;"""

PLACES_QUERY = """[out:json][timeout:180];
area["ISO3166-1"="HR"][admin_level=2]->.hr;
node["place"~"^(city|town|village|suburb|quarter|neighbourhood)$"](area.hr);
out;"""

CHAIN_WORDS = {
    "konzum": ("konzum",),
    "lidl": ("lidl",),
    "kaufland": ("kaufland",),
    "spar": ("spar", "interspar"),
    "plodine": ("plodine",),
}
PLACE_RANK = {"city": 0, "town": 1, "suburb": 2, "quarter": 3, "village": 4, "neighbourhood": 5}
# Words that say nothing about which street it is.
FILLER = {
    "ulica",
    "ul",
    "cesta",
    "c",
    "put",
    "trg",
    "obala",
    "naselje",
    "bb",
    "b",
    "b.b",
    "i",
    "kneza",
    "kralja",
    "sv",
    "svetog",
    "svete",
    "dr",
}
TOWN_KM = 8.0
CITY_KM = 15.0  # Zagreb, Split, Osijek... spread wider
LONE_SHOP_KM = 3.0


def fold(text: str) -> str:
    """Lowercase, no diacritics (đ as d), only letters, digits and spaces."""
    text = text.replace("đ", "d").replace("Đ", "D")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower()).strip()


def split_address(address: str) -> tuple[set[str], str | None]:
    """'Ulica Kralja Zvonimira 2a' -> ({'zvonimira'}, '2a')."""
    words = fold(address).split()
    number = None
    # The last number is the house number ("Ulica 3. Gardijske Brigade 2" -> 2).
    for i, w in enumerate(words):
        if re.fullmatch(r"\d+[a-z]?", w) and i > 0:
            number = w
            # "1 a" written apart
            if i + 1 < len(words) and re.fullmatch(r"[a-z]", words[i + 1]):
                number += words[i + 1]
    street = {w for w in words if not re.fullmatch(r"\d+[a-z]?", w) and w not in FILLER and len(w) > 1}
    return street, number


def same_street(a: set[str], b: set[str]) -> bool:
    if not a or not b:
        return False
    shared = len(a & b)
    return shared > 0 and (shared == min(len(a), len(b)) or shared / len(a | b) >= 0.5)


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def chain_of(tags: dict) -> str | None:
    label = fold(f"{tags.get('brand', '')} {tags.get('name', '')}").split()
    for chain, words in CHAIN_WORDS.items():
        if any(w in label for w in words):
            return chain
    return None


def shops_from(elements: list[dict]) -> list[dict]:
    out = []
    for e in elements:
        tags = e.get("tags", {})
        chain = chain_of(tags)
        pos = (
            (e["lat"], e["lon"]) if "lat" in e else (e["center"]["lat"], e["center"]["lon"]) if "center" in e else None
        )
        if not chain or not pos:
            continue
        street, _ = split_address(tags.get("addr:street", ""))
        number = fold(tags.get("addr:housenumber", "")).replace(" ", "") or None
        out.append(
            {"chain": chain, "pos": pos, "street": street, "number": number, "city": fold(tags.get("addr:city", ""))}
        )
    return out


def places_from(elements: list[dict]) -> dict[str, list[tuple[int, tuple[float, float]]]]:
    out: dict[str, list[tuple[int, tuple[float, float]]]] = {}
    for e in elements:
        name = fold(e.get("tags", {}).get("name", ""))
        if name:
            out.setdefault(name, []).append((PLACE_RANK.get(e["tags"].get("place", ""), 9), (e["lat"], e["lon"])))
    return out


def zip_centres(elements: list[dict]) -> dict[str, tuple[float, float]]:
    """Average position of the shops with each postcode, and of each
    postcode's first 3 and 2 digits (31216 -> 312, 31: around Osijek)."""
    sums: dict[str, list[float]] = {}
    for e in elements:
        pc = re.sub(r"\D", "", e.get("tags", {}).get("addr:postcode", ""))
        pos = (
            (e["lat"], e["lon"]) if "lat" in e else (e["center"]["lat"], e["center"]["lon"]) if "center" in e else None
        )
        if len(pc) != 5 or not pos:
            continue
        for key in (pc, pc[:3], pc[:2]):
            acc = sums.setdefault(key, [0.0, 0.0, 0])
            acc[0] += pos[0]
            acc[1] += pos[1]
            acc[2] += 1
    return {k: (v[0] / v[2], v[1] / v[2]) for k, v in sums.items()}


def town_position(
    city: str, places: dict, chain_shops: list[dict], near: tuple[float, float] | None = None
) -> tuple[int, tuple[float, float]] | None:
    options = places.get(fold(city))
    if not options:
        # "Zagreb Sesvete", "Split - Kman": try the parts
        for part in fold(city).split():
            if part in places and len(part) > 3:
                options = places[part]
                break
    if not options:
        return None
    if len(options) == 1:
        return options[0]

    # Several villages share a name: the one in the store's postcode area,
    # else the one with a shop of this chain close by.
    if near:
        return min(options, key=lambda o: km(o[1], near))

    def score(o: tuple[int, tuple[float, float]]) -> tuple[int, int]:
        near = sum(1 for s in chain_shops if km(s["pos"], o[1]) < 3)
        return (-near, o[0])

    return min(options, key=score)


def locate(stores: dict[str, list[dict]], shop_elements: list[dict], place_elements: list[dict]) -> dict[str, list]:
    """{"konzum:1829": [lat, lon, 1]} where the last number is 1 for the shop
    itself and 0 for the town's position."""
    shops = shops_from(shop_elements)
    places = places_from(place_elements)
    zips = zip_centres(shop_elements)
    # Spar and Kaufland list no postcode: borrow one from another chain's store in that town.
    town_zip: dict[str, str] = {}
    for items in stores.values():
        for st in items:
            if st.get("zip"):
                town_zip.setdefault(fold(st["city"]), st["zip"])
    out: dict[str, list] = {}
    for chain, items in stores.items():
        chain_shops = [s for s in shops if s["chain"] == chain]
        per_city: dict[str, int] = {}
        for st in items:
            per_city[fold(st["city"])] = per_city.get(fold(st["city"]), 0) + 1
        used: set[int] = set()
        for st in items:
            street, number = split_address(st["address"])
            pc = re.sub(r"\D", "", st.get("zip") or town_zip.get(fold(st["city"]), ""))
            area = zips.get(pc) or zips.get(pc[:3]) or zips.get(pc[:2]) if len(pc) == 5 else None
            found = town_position(st["city"], places, chain_shops, area)
            town = found[1] if found else None
            radius = CITY_KM if found and found[0] == PLACE_RANK["city"] else TOWN_KM
            if town:
                near = [i for i, s in enumerate(chain_shops) if km(s["pos"], town) <= radius]
            else:
                near = [i for i, s in enumerate(chain_shops) if s["city"] and s["city"] == fold(st["city"])]
            by_street = [i for i in near if same_street(street, chain_shops[i]["street"])]
            exact = [i for i in by_street if number and chain_shops[i]["number"] == number]
            pick = None
            if exact:
                pick = exact[0]
            elif len(by_street) == 1:
                pick = by_street[0]
            elif town and per_city[fold(st["city"])] == 1:
                lone = [i for i in near if km(chain_shops[i]["pos"], town) <= LONE_SHOP_KM and i not in used]
                if len(lone) == 1:
                    pick = lone[0]
            key = f"{chain}:{st['id']}"
            if pick is not None:
                used.add(pick)
                lat, lon = chain_shops[pick]["pos"]
                out[key] = [round(lat, 4), round(lon, 4), 1]
            elif town:
                out[key] = [round(town[0], 4), round(town[1], 4), 0]
    return out


def overpass(query: str) -> list[dict]:
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(OVERPASS, data=data, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=240) as res:  # noqa: S310 (fixed https URL)
        return json.load(res)["elements"]


def dump_locations(found: dict[str, list]) -> str:
    """One store per line, so a refresh shows up as a readable diff."""
    lines = [f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in sorted(found.items())]
    return "{\n" + ",\n".join(lines) + "\n}\n"


def run_locate(stores_dir: Path, out: Path) -> dict[str, int]:
    stores = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(stores_dir.glob("*.json"))}
    found = locate(stores, overpass(SHOPS_QUERY), overpass(PLACES_QUERY))
    out.write_text(dump_locations(found), encoding="utf-8")
    total = sum(len(v) for v in stores.values())
    return {
        "stores": total,
        "shop": sum(1 for v in found.values() if v[2]),
        "town": sum(1 for v in found.values() if not v[2]),
        "missing": total - len(found),
    }


def add_locations(stores: list[dict], chain: str, locations: dict[str, list]) -> list[dict]:
    """The store list with lat/lon where known."""
    out = []
    for st in stores:
        loc = locations.get(f"{chain}:{st['id']}")
        if not loc:
            out.append(st)
        elif loc[2]:
            out.append({**st, "lat": loc[0], "lon": loc[1]})
        else:  # only the town is known
            out.append({**st, "lat": loc[0], "lon": loc[1], "approx": True})
    return out
