#!/usr/bin/env python3
"""Curate Gemini Deep Research output (unknown statuses, batch 06)."""
import json, collections
OK = set("001 002 034 036 045 059 061 008 028 042 049 071 079 021 070 083 057 058 062 006 076".split())
ALLOWED = {"operational", "partial", "under_construction", "planned", "approved_planned", "unknown"}
sc = json.load(open("status_changes_raw.json", encoding="utf-8"))
facts = json.load(open("facts_raw.json", encoding="utf-8"))
ev = {e["evidence_ref"]: e for e in json.load(open("evidence_raw.json", encoding="utf-8"))}
for r, e in ev.items():
    e["url_check"] = "ok" if r[-3:] in OK else "unchecked"
    e["accessed_date"] = "2026-11-16"
def strong(refs):
    return any(ev.get(r, {}).get("source_type") == "official" and ev.get(r, {}).get("url_check") == "ok" for r in refs)
accepted, rejected = [], []
for s in sc:
    reason = None
    if s["to"] not in ALLOWED: reason = f"status '{s['to']}' not in schema enum; kept unknown, facts retained"
    elif not strong(s.get("basis", [])): reason = "no official source with a verified URL in basis; kept unknown"
    (rejected if reason else accepted).append({**s, **({"rejected_reason": reason} if reason else {})})
out_f, used = [], set()
for f in facts:
    e = ev.get(f["evidence_ref"])
    if not e: continue
    if f.get("verification_state") == "verified" and not (e["source_type"] == "official" and e["url_check"] == "ok"):
        f["verification_state"] = "single_source"
    out_f.append(f); used.add(f["evidence_ref"])
for s in accepted: used.update(s["basis"])
json.dump(accepted, open("status_changes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(rejected, open("status_changes_rejected.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(out_f, open("facts.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump([ev[r] for r in sorted(used) if r in ev], open("evidence.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("accepted", [(s["entity_code"], s["to"]) for s in accepted])
print("rejected", [(s["entity_code"], s["to"], s["rejected_reason"][:40]) for s in rejected])
print(len(out_f), "facts", collections.Counter(f["verification_state"] for f in out_f), len(used), "evidence")
