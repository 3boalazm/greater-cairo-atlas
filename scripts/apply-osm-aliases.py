#!/usr/bin/env python3
"""Apply documented exact-label aliases to the adapted seed for the stored OSM extract."""
from __future__ import annotations
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "data/seed/entities.csv"
OVERRIDES = ROOT / "data/research/rev5/osm-alias-overrides.json"


def main() -> None:
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    with SEED.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames
        rows = list(reader)
    if not headers or "code" not in headers or "aliases" not in headers:
        raise SystemExit("Canonical entities CSV must include code and aliases columns.")
    by_code = {row["code"]: row for row in rows}
    missing = sorted(set(overrides) - set(by_code))
    if missing:
        raise SystemExit(f"OSM alias overrides reference missing entities: {', '.join(missing)}")
    for code, additions in overrides.items():
        aliases = [part.strip() for part in (by_code[code].get("aliases") or "").split("|") if part.strip()]
        for alias in additions:
            if not isinstance(alias, str) or not alias.strip() or "|" in alias:
                raise SystemExit(f"Invalid OSM alias for {code}.")
            if alias not in aliases:
                aliases.append(alias)
        by_code[code]["aliases"] = "|".join(aliases)
    with SEED.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"Applied OSM exact-label aliases for {len(overrides)} Metro entities.")


if __name__ == "__main__":
    main()
