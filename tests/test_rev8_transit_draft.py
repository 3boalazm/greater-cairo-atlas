import csv
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DRAFT = ROOT / "data/research/rev8-draft"
REV7 = ROOT / "data/research/rev7"


class Rev8TransitDraftTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with (DRAFT / "entities_rev8.csv").open(encoding="utf-8-sig", newline="") as stream:
            cls.entities = list(csv.DictReader(stream))
        cls.entity_by_code = {row["entity_code"]: row for row in cls.entities}
        cls.facts = json.loads((DRAFT / "facts_rev8.json").read_text(encoding="utf-8"))
        cls.evidence = json.loads((DRAFT / "evidence_rev8.json").read_text(encoding="utf-8"))
        cls.evidence_by_code = {row["evidence_ref"]: row for row in cls.evidence}
        with (REV7 / "entities_rev7.csv").open(encoding="utf-8-sig", newline="") as stream:
            cls.rev7_codes = {row["entity_code"] for row in csv.DictReader(stream)}
        cls.new_fact_refs = set(cls.evidence_by_code) - {row["evidence_ref"] for row in json.loads((REV7 / "evidence_rev7.json").read_text(encoding="utf-8"))}

    def test_draft_is_additive_and_keeps_one_station_entity_per_osm_group(self):
        new_codes = set(self.entity_by_code) - self.rev7_codes
        new_stops = [self.entity_by_code[code] for code in new_codes if code.startswith("STOP-")]
        new_rail = [self.entity_by_code[code] for code in new_codes if code.startswith("RAIL-")]
        self.assertEqual(len(new_stops), 77)
        self.assertEqual(len(new_rail), 1)
        self.assertTrue(all(row["entity_code"].startswith("STOP-OSM-") for row in new_stops))
        self.assertTrue(all(row["entity_code"].startswith("RAIL-OSM-") for row in new_rail))
        self.assertEqual(len(self.entity_by_code), len(self.entities))
        self.assertTrue((DRAFT / "CHANGELOG_rev8.md").is_file())
        self.assertIn("not a seed import", (DRAFT / "CHANGELOG_rev8.md").read_text(encoding="utf-8"))

    def test_new_relation_evidence_starts_at_ev351_and_is_osm_dataset_evidence(self):
        codes = sorted(self.new_fact_refs, key=lambda code: int(code.removeprefix("EV-")))
        self.assertEqual(codes[0], "EV-351")
        self.assertEqual(codes[-1], "EV-368")
        self.assertEqual(len(codes), 18)
        for code in codes:
            row = self.evidence_by_code[code]
            self.assertEqual(row["source_type"], "dataset")
            self.assertEqual(row["publisher"], "OpenStreetMap contributors")
            self.assertEqual(row["accessed_date"], "2026-11-14")
            self.assertRegex(row["source_url"], r"^https://www\.openstreetmap\.org/relation/\d+$")

    def test_new_facts_are_candidate_and_have_relation_evidence(self):
        new_facts = [fact for fact in self.facts if (set(fact["evidence_ref"]) if isinstance(fact["evidence_ref"], list) else {fact["evidence_ref"]}) & self.new_fact_refs]
        self.assertGreater(len(new_facts), 600)
        self.assertTrue(all(fact["verification_state"] == "candidate" for fact in new_facts))
        self.assertTrue(all(fact["attribute_key"] in {"line_membership", "line_order", "osm_node_id"} for fact in new_facts))
        self.assertTrue(all(
            (fact["evidence_ref"] in self.new_fact_refs if isinstance(fact["evidence_ref"], str)
             else set(fact["evidence_ref"]).issubset(self.new_fact_refs))
            for fact in new_facts
        ))
        self.assertTrue(any(fact["attribute_key"] == "line_order" for fact in new_facts))
        self.assertTrue(any(fact["attribute_key"] == "osm_node_id" for fact in new_facts))
        rail_ramses_memberships = {
            fact["value"] for fact in new_facts
            if fact["entity_code"] == "RAIL-RAMSES" and fact["attribute_key"] == "line_membership"
        }
        self.assertTrue({"TRANSIT-METRO-L1", "TRANSIT-METRO-L2"}.issubset(rail_ramses_memberships))


if __name__ == "__main__":
    unittest.main()
