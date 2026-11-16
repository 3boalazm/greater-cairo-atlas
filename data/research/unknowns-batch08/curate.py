#!/usr/bin/env python3
"""Generic curator for Gemini Deep Research batches (Greater Cairo Atlas).

  curate.py FOLDER --mode entities --sector NORTH [--urls url_status.json] [--remap remap.json]
                   [--auto-remap] [--seed data/seed/entities.csv] [--also 'data/research/*/entities.csv']
  curate.py FOLDER --mode status  [--urls url_status.json]

FOLDER holds gemini_raw.json = {"entities_csv"|"status_changes_json": str, "facts_json": str, "evidence_json": str}.
Rules (same as central-batch05 / unknowns-batch06):
  * `verified` only when the evidence is official AND url_check == ok; otherwise single_source.
  * dead (404/410) evidence is dropped together with its facts.
  * entities already in the seed (same code, or same normalised name/alias and same type with --auto-remap)
    are remapped, never duplicated.
  * status changes are accepted only with an official, url-ok source in `basis`.
Nothing is invented: every output row comes from gemini_raw.json.
"""
import argparse, collections, csv, glob, io, json, os, re, sys, unicodedata

TYPES = {"city", "district", "road", "bridge", "transit_line", "transit_stop", "rail_station", "landmark",
         "project", "authority", "airport"}
STATUS_OK = {"operational", "partial", "under_construction", "planned", "approved_planned", "unknown"}
STATES_OK = {"verified", "corroborated", "single_source", "candidate", "disputed", "superseded", "rejected"}
COLS = ["code", "name_ar", "name_en", "entity_type", "sector", "status", "aliases", "description"]
ACCESSED = "2026-11-16"


def lenient_json(s):
    s = (s or "").strip()
    s = re.sub(r"^```(?:json|csv)?\s*|\s*```$", "", s)
    try:
        return json.loads(s)
    except Exception:
        return json.loads(re.sub(r",\s*([}\]])", r"\1", s))


AR_MARKS = re.compile("[ؗ-ًؚ-ْـ]")


def norm_ar(s):
    s = unicodedata.normalize("NFKC", s or "")
    s = AR_MARKS.sub("", s)
    for a, b in (("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ى", "ي"), ("ة", "ه"), ("ؤ", "و"), ("ئ", "ي")):
        s = s.replace(a, b)
    s = re.sub(r"(^|\s)ال", r"\1", s)
    return re.sub(r"[^0-9ء-ي]+", "", s)


def norm_en(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return "".join(t for t in re.split(r"[^a-z0-9]+", s) if t and t not in {"el", "al", "the", "of"})


def split_aliases(cell):
    """Aliases may arrive separated by | (canonical), ; or the Arabic semicolon; return clean unique parts."""
    out, seen = [], set()
    for a in re.split(r"[|;\u061b]", cell or ""):
        a = a.strip()
        if a and a not in seen:
            seen.add(a)
            out.append(a)
    return out


def keys_of(row):
    ks = set()
    for v in [row.get("name_ar", ""), row.get("name_en", "")] + split_aliases(row.get("aliases")):
        v = v.strip()
        if not v:
            continue
        k = norm_ar(v) if re.search("[ء-ي]", v) else norm_en(v)
        if len(k) >= 4:
            ks.add(k)
    return ks


def load_entities(path):
    return list(csv.DictReader(open(path, encoding="utf-8")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--mode", choices=["entities", "status"], required=True)
    ap.add_argument("--sector")
    ap.add_argument("--urls")
    ap.add_argument("--remap")
    ap.add_argument("--auto-remap", action="store_true")
    ap.add_argument("--seed", default="/home/claude/greater-cairo-atlas/data/seed/entities.csv")
    ap.add_argument("--also", default="/home/claude/greater-cairo-atlas/data/research/*/entities.csv")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    F = a.folder
    rep = []

    def say(*x):
        line = " ".join(str(i) for i in x)
        rep.append(line)
        print(line)

    raw = json.load(open(os.path.join(F, "gemini_raw.json"), encoding="utf-8"))

    def pick(prefix):
        for k in raw:
            if k.startswith(prefix):
                return raw[k]
        raise KeyError(prefix)

    facts_s, ev_s = pick("facts"), pick("evidence")
    first = pick("entities") if a.mode == "entities" else pick("status")
    if not a.dry:
        open(os.path.join(F, "entities_raw.csv" if a.mode == "entities" else "status_changes_raw.json"), "w", encoding="utf-8").write(first)
        open(os.path.join(F, "facts_raw.json"), "w", encoding="utf-8").write(facts_s)
        open(os.path.join(F, "evidence_raw.json"), "w", encoding="utf-8").write(ev_s)
    facts = lenient_json(facts_s)
    ev_list = lenient_json(ev_s)

    # ---- url status
    urls = {}
    if a.urls and os.path.exists(a.urls):
        urls = json.load(open(a.urls, encoding="utf-8"))
    ev = {}
    for e in ev_list:
        r = e.get("evidence_ref", "").strip()
        if not r or not str(e.get("source_url", "")).startswith("http"):
            say("DROP evidence (no ref/url):", r)
            continue
        st = urls.get(r[-3:]) or urls.get(r) or "unchecked"
        e["url_check"] = st if st in ("ok", "dead_404") else "unchecked"
        e["accessed_date"] = ACCESSED
        ev[r] = e

    def official_ok(r):
        e = ev.get(r)
        return bool(e) and e.get("source_type") == "official" and e["url_check"] == "ok"

    # ---- existing index
    existing = load_entities(a.seed)
    ex_codes = {x["code"]: x for x in existing}
    pend = []
    for p in glob.glob(a.also):
        if os.path.abspath(os.path.dirname(p)) == os.path.abspath(F):
            continue
        pend += [x for x in load_entities(p) if x["code"] not in ex_codes]
    idx = collections.defaultdict(set)
    allx = {x["code"]: x for x in existing + pend}
    for c, x in allx.items():
        for k in keys_of(x):
            idx[k].add(c)

    out_f, used = [], set()
    remap = {}
    new = []
    accepted, rejected = [], []

    if a.mode == "entities":
        rd = list(csv.reader(io.StringIO(first.strip())))
        hdr = [h.strip() for h in rd[0]]
        rows = []
        for fl in rd[1:]:
            if len(fl) > len(hdr) and "name_en" in hdr and "entity_type" in hdr:
                # Gemini sometimes leaves an unquoted comma inside name_en: merge the overflow back into it.
                extra = len(fl) - len(hdr)
                i = hdr.index("name_en")
                fixed = fl[:i] + [", ".join(x.strip() for x in fl[i:i + extra + 1])] + fl[i + extra + 1:]
                if fixed[hdr.index("entity_type")].strip() in TYPES:
                    say("REPAIR csv row (unquoted comma in name_en):", fixed[0])
                    fl = fixed
            rows.append(dict(zip(hdr, fl)))
        seen, ents = set(), []
        for r in rows:
            r = {k.strip(): (v or "").strip() for k, v in r.items() if k}
            for c in COLS:
                r.setdefault(c, "")
            if not re.fullmatch(r"[A-Z0-9][A-Z0-9-]*", r["code"]) or r["code"] in seen:
                say("DROP entity (bad/duplicate code):", r["code"])
                continue
            if r["entity_type"] not in TYPES:
                say("DROP entity (bad type):", r["code"], r["entity_type"])
                continue
            if r["status"] not in STATUS_OK:
                say("FIX status ->unknown:", r["code"], r["status"])
                r["status"] = "unknown"
            seen.add(r["code"])
            ents.append(r)
        manual = json.load(open(a.remap, encoding="utf-8")) if a.remap else {}
        review = []
        for r in ents:
            c = r["code"]
            if c in manual:
                if manual[c]:
                    remap[c] = manual[c]
                continue
            if c in allx:
                remap[c] = c
                continue
            hits = collections.defaultdict(set)
            for k in keys_of(r):
                for t in idx.get(k, ()):
                    hits[t].add(k)
            same = [t for t in hits if allx[t]["entity_type"] == r["entity_type"]]
            diff = [t for t in hits if allx[t]["entity_type"] != r["entity_type"]]
            fuzzy = set()
            for k in keys_of(r):
                if len(k) >= 6:
                    for kk, ts in idx.items():
                        if len(kk) >= 6 and kk != k and (k in kk or kk in k):
                            fuzzy |= {t for t in ts if allx[t]["entity_type"] == r["entity_type"]}
            fuzzy -= set(hits)
            if len(same) == 1 and a.auto_remap:
                remap[c] = same[0]
                say("AUTO-REMAP", c, "->", same[0], "|", r["name_ar"], "~", allx[same[0]]["name_ar"])
            elif same or diff or fuzzy:
                review.append((c, r["name_ar"], r["entity_type"], same, diff, sorted(fuzzy)[:4]))
        for c, n, t, same, diff, fz in review:
            say("REVIEW", c, "|", n, "|", t, "| same-type:", same, "| other-type:", diff, "| fuzzy:", fz)
        new = [r for r in ents if r["code"] not in remap]
        for r in new:
            if a.sector:
                r["sector"] = a.sector
        codes = {r["code"] for r in new} | set(remap.values()) | set(allx)
        bad = collections.Counter()
        for f in facts:
            e = ev.get(f.get("evidence_ref"))
            if not e or e["url_check"] == "dead_404":
                continue
            if f.get("entity_code") not in remap and f.get("entity_code") not in {r["code"] for r in new} and f.get("entity_code") not in allx:
                bad[f.get("entity_code")] += 1
                continue
            f["entity_code"] = remap.get(f["entity_code"], f["entity_code"])
            if f.get("verification_state") not in STATES_OK:
                f["verification_state"] = "candidate"
            if f["verification_state"] == "verified" and not official_ok(f["evidence_ref"]):
                f["verification_state"] = "single_source"
            if f["verification_state"] == "corroborated" and ev[f["evidence_ref"]]["url_check"] != "ok":
                f["verification_state"] = "single_source"  # rule added in unknowns-batch08: no `corroborated` label on a source that could not be opened
            key = (f["entity_code"], f.get("attribute_key"), str(f.get("value")), f["evidence_ref"])
            if key in used:
                continue
            used.add(key)
            out_f.append(f)
        if bad:
            say("DROP facts (unknown entity code):", dict(bad))
        has = {f["entity_code"] for f in out_f}
        empty = [r["code"] for r in new if r["code"] not in has]
        if empty:
            say("DROP entities with no surviving fact:", empty)
        new = [r for r in new if r["code"] in has]
        keep = {r["code"] for r in new} | set(remap.values()) | set(allx)
        out_f = [f for f in out_f if f["entity_code"] in keep]
    else:
        sc = lenient_json(first)
        for s in sc:
            for r in list(s.get("basis", [])):
                if ev.get(r, {}).get("url_check") == "dead_404":
                    s["basis"].remove(r)
            reason = None
            if s.get("to") not in STATUS_OK:
                reason = f"status '{s.get('to')}' not in schema enum; kept unknown"
            elif not any(official_ok(r) for r in s.get("basis", [])):
                reason = "no official source with a verified URL in basis; kept unknown"
            (rejected if reason else accepted).append({**s, **({"rejected_reason": reason} if reason else {})})
        for f in facts:
            e = ev.get(f.get("evidence_ref"))
            if not e or e["url_check"] == "dead_404":
                continue
            if f.get("verification_state") not in STATES_OK:
                f["verification_state"] = "candidate"
            if f["verification_state"] == "verified" and not official_ok(f["evidence_ref"]):
                f["verification_state"] = "single_source"
            if f["verification_state"] == "corroborated" and ev[f["evidence_ref"]]["url_check"] != "ok":
                f["verification_state"] = "single_source"  # rule added in unknowns-batch08: no `corroborated` label on a source that could not be opened
            out_f.append(f)
        used = {f["evidence_ref"] for f in out_f}

    used_ev = {f["evidence_ref"] for f in out_f}
    for s in accepted:
        used_ev.update(r for r in s.get("basis", []))
    out_ev = [ev[r] for r in sorted(used_ev) if r in ev]
    say(f"RESULT new_entities={len(new)} remapped={len(remap)} facts={len(out_f)} evidence={len(out_ev)}")
    say("facts by state:", dict(collections.Counter(f["verification_state"] for f in out_f)))
    say("evidence url_check:", dict(collections.Counter(e["url_check"] for e in out_ev)))
    if a.mode == "entities":
        say("new by status:", dict(collections.Counter(r["status"] for r in new)))
        say("new by type:", dict(collections.Counter(r["entity_type"] for r in new)))
    else:
        say("accepted:", [(s["entity_code"], s.get("to")) for s in accepted])
        say("rejected:", [(s["entity_code"], s.get("to"), s["rejected_reason"][:50]) for s in rejected])
    if a.dry:
        return
    w = lambda n, o: json.dump(o, open(os.path.join(F, n), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    w("facts.json", out_f)
    w("evidence.json", out_ev)
    if a.mode == "entities":
        for r in new:
            r["aliases"] = "|".join(split_aliases(r.get("aliases")))
        with open(os.path.join(F, "entities.csv"), "w", encoding="utf-8", newline="") as fh:
            wr = csv.DictWriter(fh, fieldnames=COLS, extrasaction="ignore")
            wr.writeheader()
            wr.writerows(new)
        w("code_remap.json", remap)
    else:
        w("status_changes.json", accepted)
        w("status_changes_rejected.json", rejected)
    open(os.path.join(F, "curation_report.txt"), "w", encoding="utf-8").write("\n".join(rep) + "\n")


if __name__ == "__main__":
    main()
