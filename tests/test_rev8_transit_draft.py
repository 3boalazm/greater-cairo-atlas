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
        cls.rev7_evidence_refs = {
            row["evidence_ref"]
            for row in json.loads((REV7 / "evidence_rev7.json").read_text(encoding="utf-8"))
        }
        cls.new_fact_refs = set(cls.evidence_by_code) - cls.rev7_evidence_refs

    def test_revision_counts_and_stable_line_prefixed_codes(self):
        new_codes = set(self.entity_by_code) - self.rev7_codes
        new_stops = [self.entity_by_code[code] for code in new_codes if self.entity_by_code[code]["entity_type"] == "transit_stop"]
        new_rail = [self.entity_by_code[code] for code in new_codes if self.entity_by_code[code]["entity_type"] == "rail_station"]
        self.assertEqual(len(self.entities), 417)
        self.assertEqual(len(new_stops), 74)
        self.assertEqual(len(new_rail), 1)
        prefixes = ("STOP-M1-", "STOP-M2-", "STOP-M3-", "STOP-LRT-", "STOP-MRE-")
        self.assertTrue(all(row["entity_code"].startswith(prefixes) or row["entity_code"] == "STOP-SHUHADA" for row in new_stops))
        self.assertEqual([row["entity_code"] for row in new_rail], ["RAIL-GIZA-SUBURBS"])
        self.assertFalse(any("-OSM-" in row["entity_code"] for row in self.entities))
        self.assertTrue((DRAFT / "CHANGELOG_rev8.md").is_file())
        self.assertIn("417 entities", (DRAFT / "CHANGELOG_rev8.md").read_text(encoding="utf-8"))

    def test_duplicate_station_positions_are_folded_into_canonical_entities(self):
        node_ids = {}
        for code in ("STOP-M3-RING-ROAD", "STOP-M3-EL-NOZHA"):
            node_ids[code] = {
                int(fact["value"])
                for fact in self.facts
                if fact["entity_code"] == code and fact["attribute_key"] == "osm_node_id"
            }
        self.assertEqual(node_ids["STOP-M3-RING-ROAD"], {9077274203, 11495591821})
        self.assertEqual(node_ids["STOP-M3-EL-NOZHA"], {7559205785, 7926259279})
        self.assertEqual(sum(row["entity_code"] == "STOP-M3-RING-ROAD" for row in self.entities), 1)
        self.assertEqual(sum(row["entity_code"] == "STOP-M3-EL-NOZHA" for row in self.entities), 1)
        self.assertFalse(any(row["entity_code"] in {
            "STOP-M1-AL-MARJ", "STOP-M2-SHOBRA-AL-KHEIMA", "STOP-M3-KIT-KAT"
        } for row in self.entities))
        self.assertTrue({
            "STOP-M1-EL-MARG", "STOP-M2-SHUBRA-ELKHEIMA", "STOP-KIT-KAT"
        }.issubset(self.entity_by_code))

    def test_osm_arabic_names_and_sector_assignments_are_conservative(self):
        for code in ("STOP-M3-SUDAN", "STOP-M3-AL-BOHY", "STOP-M3-IMBABA", "STOP-M3-AL-KAWMEIAH"):
            row = self.entity_by_code[code]
            self.assertEqual(row["canonical_name_ar"], row["canonical_name_en"])
        self.assertEqual(self.entity_by_code["STOP-M1-HELWAN"]["sector_code"], "SOUTH")
        self.assertEqual(self.entity_by_code["STOP-ADLY-MANSOUR"]["sector_code"], "EAST")
        self.assertEqual(self.entity_by_code["STOP-KIT-KAT"]["sector_code"], "WEST")
        self.assertEqual(self.entity_by_code["STOP-M3-IMBABA"]["sector_code"], "WEST")

    def test_west_monorail_wadi_el_nil_remains_separate_and_linked(self):
        west = self.entity_by_code["STOP-MRW-WADI-EL-NIL"]
        metro = self.entity_by_code["STOP-M3-WADI-EL-NILE"]
        self.assertEqual((west["sector_code"], west["status"]), ("WEST", "under_construction"))
        self.assertNotEqual(west["entity_code"], metro["entity_code"])
        self.assertTrue(any(
            fact["entity_code"] == metro["entity_code"]
            and fact["attribute_key"] == "interchange_with"
            and fact["value"] == west["entity_code"]
            for fact in self.facts
        ))

    def test_new_relation_evidence_starts_at_ev351_and_is_osm_dataset_evidence(self):
        codes = sorted(self.new_fact_refs, key=lambda code: int(code.removeprefix("EV-")))
        relation_codes = [code for code in codes if 351 <= int(code.removeprefix("EV-")) <= 368]
        self.assertEqual(relation_codes[0], "EV-351")
        self.assertEqual(relation_codes[-1], "EV-368")
        self.assertEqual(len(relation_codes), 18)
        for code in relation_codes:
            row = self.evidence_by_code[code]
            self.assertEqual(row["source_type"], "dataset")
            self.assertEqual(row["publisher"], "OpenStreetMap contributors")
            self.assertEqual(row["accessed_date"], "2026-11-14")
            self.assertRegex(row["source_url"], r"^https://www\.openstreetmap\.org/relation/\d+$")

    def test_new_facts_are_candidate_and_have_relation_evidence(self):
        new_facts = [
            fact for fact in self.facts
            if (set(fact["evidence_ref"]) if isinstance(fact["evidence_ref"], list) else {fact["evidence_ref"]}) & self.new_fact_refs
        ]
        self.assertGreater(len(new_facts), 600)
        self.assertTrue(all(fact["verification_state"] in {"candidate", "superseded"} for fact in new_facts))
        self.assertTrue(all(fact["attribute_key"] in {"line_membership", "line_order", "osm_node_id", "interchange_with", "operational_status"} for fact in new_facts))
        self.assertTrue(all(
            (fact["evidence_ref"] in self.new_fact_refs if isinstance(fact["evidence_ref"], str)
             else set(fact["evidence_ref"]).issubset(self.new_fact_refs))
            for fact in new_facts
        ))
        self.assertTrue(any(fact["attribute_key"] == "line_order" for fact in new_facts))
        self.assertTrue(any(fact["attribute_key"] == "osm_node_id" for fact in new_facts))
        shuhada = [fact for fact in self.facts if fact["entity_code"] == "STOP-SHUHADA"]
        self.assertTrue(any(fact["attribute_key"] == "osm_node_id" and fact["value"] == 5194295702 for fact in shuhada))
        shuhada_memberships = {fact["value"] for fact in shuhada if fact["attribute_key"] == "line_membership"}
        self.assertEqual(shuhada_memberships, {"TRANSIT-METRO-L1", "TRANSIT-METRO-L2"})
        ramses_metro = [fact for fact in self.facts if fact["entity_code"] == "RAIL-RAMSES"
                        and fact["attribute_key"] == "line_membership" and str(fact["value"]).startswith("TRANSIT-METRO-")]
        self.assertTrue(ramses_metro)
        self.assertTrue(all(fact["verification_state"] == "superseded" for fact in ramses_metro))


if __name__ == "__main__":
    unittest.main()
