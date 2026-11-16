#!/usr/bin/env python3
"""Apply curator edits to ChatGPT web-search chunks and merge them into one raw file for curate.py.

Usage:
  python3 -I build_east.py WORKDIR NN [NN ...]

For every chunk NN it reads  WORKDIR/chatgpt_raw_NN.json  (keys entities_csv / facts_json / evidence_json, all strings)
and  WORKDIR/edits_NN.json  (curator edits, see below), writes the merged
  WORKDIR/chatgpt_raw.json      (same 3-key shape, ready for  curate.py --raw chatgpt_raw.json)
  WORKDIR/build_report.txt      (every drop / change, for the README)

edits_NN.json keys (all optional):
  code_fix      {"OLD-CODE": "NEW-CODE"}                         rename an entity code everywhere in the chunk
  entity        {"CODE": {"description": "...", "aliases": "a|b", "name_en": "...", ...}}   overrides CSV fields
  drop_entities ["CODE", ...]                                      remove entity (and its facts)
  drop_facts    [["CODE", "attribute_key"], ["CODE", "attribute_key", "EV-REF"]]
  modify_facts  [{"match": ["CODE", "attribute_key"], "set": {"value": "...", "unit": null, "evidence_ref": "EV-..", ...}}]
  add_facts     [{"entity_code": "...", "attribute_key": "...", "value": "...", "unit": null,
                  "verification_state": "verified", "evidence_ref": "EV-.."}]
  drop_evidence ["EV-REF", ...]                                    (facts citing it are dropped too)
  add_evidence  [{"evidence_ref": "EV-..", "source_url": "...", "publisher": "...", "title": "...", "note": "...",
                  "source_type": "official", "published_date": null}]   evidence the curator found and read himself
  evidence_fix  {"EV-REF": {"source_type": "secondary", "published_date": null, ...}}
  add_entities  [{"code": "...", "name_ar": "...", "name_en": "...", "entity_type": "...", "sector": "EAST", "status": "...",
                  "aliases": "a|b", "description": "..."}]   entities the curator researched himself (chunk 00 has an empty raw file)

Generic rules applied to every chunk:
  * attribute keys are mapped onto keys that already have a bilingual label in the app (ATTR_MAP)
  * Arabic unit strings are mapped onto unit keys of the unit registry (UNIT_MAP); unmapped units are reported
  * evidence source_type is restricted to the five types the seed uses
"""
import csv, io, json, os, sys, collections

ATTR_MAP = {
    "land_area": "site_area",
    "official_function": "function",
    "architect": "original_architect",
    "establishment_date": "establishment_year",
    "official_name_ar": "official_name_variants",
}
UNIT_MAP = {
    "متر مربع": "m2", "م²": "m2", "م2": "m2", "sqm": "m2", "m²": "m2",
    "سنة": "year", "تاريخ": "date",
    "مقعد": "seats", "قاعة": "halls", "شخص": "persons", "فرد": "persons",
    "فندق": "hotels", "شاشة سينما": "screens", "شاشة": "screens", "غرفة": "rooms",
    "كم": "km", "كيلومتر": "km", "متر": "m", "فدان": "feddan", "محطة": "stations",
    "طالب": "students", "سرير": "beds", "سرير": "beds", "كلية": "faculties", "مبنى": "buildings",
}
SOURCE_TYPES = {"official", "news", "secondary", "dataset", "pdf"}
SOURCE_TYPE_MAP = {"data": "secondary", "academic": "secondary", "organization": "secondary", "ngo": "secondary", "web": "secondary", "other": "secondary", "gov": "official", "government": "official"}

rep = []
def say(*a):
    rep.append(" ".join(str(x) for x in a))
    print(*a)


def load(work, nn):
    raw = json.load(open(os.path.join(work, f"chatgpt_raw_{nn}.json"), encoding="utf-8"))
    ed_p = os.path.join(work, f"edits_{nn}.json")
    ed = json.load(open(ed_p, encoding="utf-8")) if os.path.exists(ed_p) else {}
    return raw, ed


def process(work, nn, merged):
    raw, ed = load(work, nn)
    rows = list(csv.DictReader(io.StringIO(raw["entities_csv"].strip())))
    facts = json.loads(raw["facts_json"])
    evid = json.loads(raw["evidence_json"])
    cf = ed.get("code_fix", {})
    for r in rows:
        if r["code"] in cf:
            say(f"[{nn}] CODE-FIX {r['code']} -> {cf[r['code']]}")
            r["code"] = cf[r["code"]]
    for f in facts:
        f["entity_code"] = cf.get(f["entity_code"], f["entity_code"])
    for c, over in ed.get("entity", {}).items():
        c = cf.get(c, c)
        hit = [r for r in rows if r["code"] == c]
        if not hit:
            say(f"[{nn}] WARN entity override for unknown code {c}")
            continue
        for k, v in over.items():
            say(f"[{nn}] ENTITY {c}.{k} edited")
            hit[0][k] = v
    for e in ed.get("add_entities", []):
        row = {k: e.get(k, "") for k in ("code", "name_ar", "name_en", "entity_type", "sector", "status", "aliases", "description")}
        if any(r["code"] == row["code"] for r in rows):
            say(f"[{nn}] WARN add_entities duplicate code {row['code']} ignored")
            continue
        rows.append(row)
        say(f"[{nn}] ADD entity {row['code']} (curator-researched directly, every source opened in Chrome)")
    drop_ent = {cf.get(c, c) for c in ed.get("drop_entities", [])}
    if drop_ent:
        rows = [r for r in rows if r["code"] not in drop_ent]
        facts = [f for f in facts if f["entity_code"] not in drop_ent]
        say(f"[{nn}] DROP entities {sorted(drop_ent)}")
    drop_ev = set(ed.get("drop_evidence", []))
    if drop_ev:
        n0 = len(facts)
        facts = [f for f in facts if f.get("evidence_ref") not in drop_ev]
        evid = [e for e in evid if e.get("evidence_ref") not in drop_ev]
        say(f"[{nn}] DROP evidence {sorted(drop_ev)} (+{n0 - len(facts)} facts that cited it)")
    for d in ed.get("drop_facts", []):
        c = cf.get(d[0], d[0])
        keep = []
        n = 0
        for f in facts:
            if f["entity_code"] == c and f["attribute_key"] == d[1] and (len(d) < 3 or f.get("evidence_ref") == d[2]):
                n += 1
                continue
            keep.append(f)
        facts = keep
        say(f"[{nn}] DROP fact {c}.{d[1]} x{n}")
    for m in ed.get("modify_facts", []):
        c = cf.get(m["match"][0], m["match"][0])
        hit = [f for f in facts if f["entity_code"] == c and f["attribute_key"] == m["match"][1]]
        if len(hit) != 1:
            say(f"[{nn}] WARN modify_facts match {m['match']} -> {len(hit)} hits")
            continue
        for k, v in m["set"].items():
            hit[0][k] = v
        say(f"[{nn}] MODIFY fact {c}.{m['match'][1]}: {sorted(m['set'])}")
    for e in ed.get("add_evidence", []):
        e = dict(e)
        e.setdefault("accessed_date", "2026-11-16")
        evid.append(e)
        say(f"[{nn}] ADD evidence {e['evidence_ref']} (curator-found, opened and read in Chrome)")
    for a in ed.get("add_facts", []):
        a = dict(a)
        a["entity_code"] = cf.get(a["entity_code"], a["entity_code"])
        a.setdefault("unit", None)
        a.setdefault("status_as_of", "2026-11-16")
        facts.append(a)
        say(f"[{nn}] ADD fact {a['entity_code']}.{a['attribute_key']}")
    for ref, fix in ed.get("evidence_fix", {}).items():
        hit = [e for e in evid if e.get("evidence_ref") == ref]
        if not hit:
            say(f"[{nn}] WARN evidence_fix unknown {ref}")
            continue
        hit[0].update(fix)
        say(f"[{nn}] EVIDENCE-FIX {ref}: {sorted(fix)}")
    # generic rules
    unmapped = collections.Counter()
    for f in facts:
        k = f["attribute_key"]
        if k in ATTR_MAP:
            f["attribute_key"] = ATTR_MAP[k]
        u = f.get("unit")
        if u:
            u = u.strip()
            if u in UNIT_MAP:
                f["unit"] = UNIT_MAP[u]
            elif any(ord(ch) > 127 for ch in u):
                unmapped[u] += 1
            else:
                f["unit"] = u
    if unmapped:
        say(f"[{nn}] WARN unmapped Arabic units: {dict(unmapped)}")
    for e in evid:
        st = (e.get("source_type") or "").strip().lower()
        st = SOURCE_TYPE_MAP.get(st, st)
        if st not in SOURCE_TYPES:
            say(f"[{nn}] WARN evidence {e.get('evidence_ref')} source_type {st!r} -> secondary")
            st = "secondary"
        e["source_type"] = st
    # facts must cite surviving evidence and surviving entities
    refs = {e["evidence_ref"] for e in evid}
    codes = {r["code"] for r in rows}
    bad = [f for f in facts if f.get("evidence_ref") not in refs or f["entity_code"] not in codes]
    if bad:
        say(f"[{nn}] DROP {len(bad)} facts with missing evidence/entity: {[(b['entity_code'], b['attribute_key'], b.get('evidence_ref')) for b in bad]}")
        facts = [f for f in facts if f not in bad]
    has = {f["entity_code"] for f in facts}
    empty = [r["code"] for r in rows if r["code"] not in has]
    if empty:
        say(f"[{nn}] DROP entities without facts: {empty}")
        rows = [r for r in rows if r["code"] in has]
    used = {f["evidence_ref"] for f in facts}
    evid = [e for e in evid if e["evidence_ref"] in used]
    merged["rows"] += rows
    merged["facts"] += facts
    merged["evid"] += evid
    say(f"[{nn}] OK entities={len(rows)} facts={len(facts)} evidence={len(evid)}")


def main():
    work = sys.argv[1]
    merged = {"rows": [], "facts": [], "evid": []}
    for nn in sys.argv[2:]:
        process(work, nn, merged)
    codes = collections.Counter(r["code"] for r in merged["rows"])
    dup = [c for c, n in codes.items() if n > 1]
    if dup:
        say("WARN duplicate entity codes across chunks:", dup)
    refs = collections.Counter(e["evidence_ref"] for e in merged["evid"])
    dupe = [c for c, n in refs.items() if n > 1]
    if dupe:
        say("WARN duplicate evidence refs across chunks:", dupe)
    cols = ["code", "name_ar", "name_en", "entity_type", "sector", "status", "aliases", "description"]
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    w.writerows(merged["rows"])
    out = {"entities_csv": buf.getvalue(), "facts_json": json.dumps(merged["facts"], ensure_ascii=False), "evidence_json": json.dumps(merged["evid"], ensure_ascii=False)}
    json.dump(out, open(os.path.join(work, "chatgpt_raw.json"), "w", encoding="utf-8"), ensure_ascii=False)
    open(os.path.join(work, "build_report.txt"), "w", encoding="utf-8").write("\n".join(rep) + "\n")
    say(f"MERGED entities={len(merged['rows'])} facts={len(merged['facts'])} evidence={len(merged['evid'])}")


if __name__ == "__main__":
    main()
