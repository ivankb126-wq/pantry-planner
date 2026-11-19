"""Command line for the price pipeline.

python -m pantry_pipeline build --out public/data
python -m pantry_pipeline check-ingredients
python -m pantry_pipeline inspect --chain spar --ingredient eggs
python -m pantry_pipeline search --chain spar JAJA
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections import Counter
from pathlib import Path

from .build import CHAINS, run, zagreb_today
from .ingredients import IngredientError, load_ingredients
from .matcher import Matcher, pack_for
from .parsing import tokens
from .sources import ArchiveSet, LocalArchiveSet, chain_files_from, list_archives

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INGREDIENTS = ROOT / "data" / "ingredients.yml"


def _archives(args) -> ArchiveSet:
    if args.local_archives:
        return LocalArchiveSet(Path(args.local_archives))
    try:
        return ArchiveSet(list_archives(), Path(args.cache) if args.cache else None)
    except Exception as err:  # noqa: BLE001
        logging.error("Could not list cijene.dev archives: %s", err)
        return ArchiveSet([])


def _product_rows(args, chain: str):
    archives = _archives(args)
    for date in archives.dates[:7]:
        files = chain_files_from(archives.get(date), chain)
        if files:
            print(f"# {chain} products from {date}", file=sys.stderr)
            return list(files.rows("products.csv"))
    raise SystemExit(f"{chain} not found in recent archives")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="pantry_pipeline")
    p.add_argument("--ingredients", default=str(DEFAULT_INGREDIENTS))
    p.add_argument("--local-archives", help="folder with <date>/<chain>/*.csv instead of cijene.dev")
    p.add_argument("--cache", help="folder for full downloads if range requests fail")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="build the app's price data")
    b.add_argument("--out", default=str(ROOT / "public" / "data"))
    b.add_argument("--chains", default=",".join(CHAINS))
    b.add_argument("--today", default=None, help="YYYY-MM-DD, default: today in Zagreb")
    b.add_argument("--previous-site", default=None, help="live site URL, to reuse its data as fallback")
    b.add_argument("--previous-dir", default=None, help="local folder with a previous build's data")
    b.add_argument("--no-crawler", action="store_true", help="never try the official sites")

    sub.add_parser("check-ingredients", help="validate data/ingredients.yml")

    i = sub.add_parser("inspect", help="show which products match an ingredient")
    i.add_argument("--chain", required=True)
    i.add_argument("--ingredient", action="append", help="ingredient id (repeatable); default: all")
    i.add_argument("--limit", type=int, default=25)

    s = sub.add_parser("search", help="find product names containing words (for writing keywords)")
    s.add_argument("--chain", required=True)
    s.add_argument("words", nargs="+")
    s.add_argument("--limit", type=int, default=60)

    args = p.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(name)s: %(message)s"
    )

    if args.cmd == "check-ingredients":
        try:
            ings, _ = load_ingredients(Path(args.ingredients))
        except IngredientError as err:
            print(err)
            return 1
        print(f"OK: {len(ings)} ingredients")
        print(Counter(i.category for i in ings).most_common())
        return 0

    if args.cmd == "build":
        run(
            out=Path(args.out),
            ingredients_path=Path(args.ingredients),
            chains=[c.strip() for c in args.chains.split(",") if c.strip()],
            archives=_archives(args),
            today=args.today or zagreb_today(),
            previous_site=args.previous_site,
            previous_dir=Path(args.previous_dir) if args.previous_dir else None,
            use_crawler=not args.no_crawler,
        )
        return 0

    if args.cmd == "search":
        want = [tokens(w)[0] for w in args.words]
        n = 0
        for r in _product_rows(args, args.chain):
            toks = tokens(r["name"])
            if all(any(t.startswith(w) for t in toks) for w in want):
                print(f"{r['name']}  | {r.get('quantity')} {r.get('unit')} | {r.get('category')}")
                n += 1
                if n >= args.limit:
                    break
        return 0

    if args.cmd == "inspect":
        ings, settings = load_ingredients(Path(args.ingredients))
        matcher = Matcher(ings, settings)
        selected = set(args.ingredient or [i.id for i in ings])
        hits: dict[str, list[str]] = {i: [] for i in selected}
        for r in _product_rows(args, args.chain):
            for ing in matcher.match(r["name"], r.get("category") or ""):
                if ing.id in selected:
                    pack = pack_for(ing, r["name"], r.get("quantity") or "", r.get("unit") or "")
                    size = f"{pack.amount:g} {ing.unit}{' loose' if pack.loose else ''}" if pack else "?? size"
                    hits[ing.id].append(f"{r['name']}  [{size}]")
        for iid in sorted(hits):
            names = hits[iid]
            print(f"\n== {iid}: {len(names)} products")
            for n in names[: args.limit]:
                print("   ", n)
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
