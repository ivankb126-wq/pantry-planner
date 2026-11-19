"""Developer tool: copy a small real sample out of the cijene.dev archive.

Keeps every product but only a few stores' prices, so the full pipeline can
run locally in seconds:

  python pipeline/tools/make_sample.py OUT_DIR --stores 3
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pantry_pipeline.build import CHAINS  # noqa: E402
from pantry_pipeline.sources import ArchiveSet, chain_in_zip, list_archives  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--stores", type=int, default=3)
    ap.add_argument("--chains", default=",".join(CHAINS))
    args = ap.parse_args()
    archives = ArchiveSet(list_archives())
    for chain in args.chains.split(","):
        for date in archives.dates[:7]:
            zf = archives.get(date)
            if zf and chain_in_zip(zf, chain):
                break
        else:
            print(f"{chain}: not found")
            continue
        dest = Path(args.out) / date / chain
        dest.mkdir(parents=True, exist_ok=True)
        for name in ("stores.csv", "products.csv"):
            (dest / name).write_bytes(zf.read(f"{chain}/{name}"))
        keep: set[str] = set()
        with zf.open(f"{chain}/prices.csv") as raw, open(dest / "prices.csv", "w", encoding="utf-8", newline="") as out:
            reader = csv.reader(io.TextIOWrapper(raw, encoding="utf-8", newline=""))
            writer = csv.writer(out)
            writer.writerow(next(reader))
            for row in reader:
                if row[0] not in keep:
                    if len(keep) >= args.stores:
                        continue
                    keep.add(row[0])
                writer.writerow(row)
        print(f"{chain}: {date}, stores {sorted(keep)}")


if __name__ == "__main__":
    main()
