#!/usr/bin/env python3
"""Curate Gemini Deep Research output (CENTRAL batch 05) into seed-ready research files."""
import csv, json, collections
OK = set("004 005 006 007 008 009 010 011 012 013 014 015 016 017 018 019 020 021 031 032 033 "
         "022 023 025 026 027 028 034 035 037 038 039 040 041 042 046 047 048 049 052 053 054 067 "
         "024 036 045 001 029 030 056 061 063 064".split())
DEAD = {"050", "051"}  # HTTP 404 on sis.gov.eg (2026-11-16)
REMAP = {"PROJ-FUSTAT-HILLS-PARK": "PROJ-FUSTAT-HILLS", "PROJ-AIN-EL-SIRA-LAKE": "LANDMARK-EIN-EL-SIRA",
         "PROJ-MAGRA-EL-OYOUN": "PROJ-MAGRA-EL-OYOUN", "TRANSIT-METRO-LINE-4": "TRANSIT-METRO-L4",
         "LANDMARK-TAHRIR-SQUARE": "DIST-TAHRIR"}
ents = list(csv.DictReader(open("entities_raw.csv", encoding="utf-8")))
facts = json.load(open("facts_raw.json", encoding="utf-8"))
ev = {e["evidence_ref"]: e for e in json.load(open("evidence_raw.json", encoding="utf-8"))}
for r, e in ev.items():
    n = r[-3:]
    e["url_check"] = "ok" if n in OK else ("dead_404" if n in DEAD else "unchecked")
    e["accessed_date"] = "2026-11-16"
out_f, used = [], set()
for f in facts:
    e = ev.get(f["evidence_ref"])
    if not e or e["url_check"] == "dead_404":
        continue
    if f.get("verification_state") == "verified" and not (e["source_type"] == "official" and e["url_check"] == "ok"):
        f["verification_state"] = "single_source"
    f["entity_code"] = REMAP.get(f["entity_code"], f["entity_code"])
    out_f.append(f); used.add(f["evidence_ref"])
new = [x for x in ents if x["code"] not in REMAP]
for x in new: x["sector"] = "CENTRAL"
codes = {x["code"] for x in new} | set(REMAP.values())
assert all(f["entity_code"] in codes for f in out_f), {f["entity_code"] for f in out_f} - codes
with open("entities.csv", "w", encoding="utf-8", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(ents[0].keys())); w.writeheader(); w.writerows(new)
json.dump(out_f, open("facts.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump([ev[r] for r in sorted(used)], open("evidence.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(REMAP, open("code_remap.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(new), "new entities;", len(out_f), "facts;", len(used), "evidence")
print(collections.Counter(f["verification_state"] for f in out_f), collections.Counter(ev[r]["url_check"] for r in used))
print(collections.Counter(x["status"] for x in new))
