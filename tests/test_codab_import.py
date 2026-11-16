import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("codab_import", ROOT / "scripts/import-codab-boundaries.py")
IMPORTER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(IMPORTER)


class CodabImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source, links, entities, fixes = IMPORTER.read_inputs()
        cls.units, cls.unions, cls.relations, cls.report = IMPORTER.build_outputs(source, links, entities, fixes)
        cls.links = links

    def test_counts_account_for_explicit_excludes_and_bbox_skips(self):
        self.assertEqual(self.report["input_features"], 858)
        self.assertEqual(self.report["excluded_features"], 4)
        self.assertEqual(self.report["out_of_extent_features"], 16)
        self.assertEqual(self.report["imported_features"], 838)
        self.assertEqual(self.report["clipped_features"], 4)

    def test_every_curated_boundary_entity_gets_union_and_rejected_codes_stay_unlinked(self):
        linked_entities = {f["properties"]["entity_code"] for f in self.unions}
        expected = {link["entity_code"] for link in self.links["links"] if link["relation"] == "boundary_equals_union"}
        self.assertEqual(linked_entities, expected)
        links_by_entity = {link["entity_code"]: set(link["pcodes"]) for link in self.links["links"] if link["relation"] == "boundary_equals_union"}
        for rejected in self.links["rejected_false_matches"]:
            entity, _, codes = rejected.partition("->")
            rejected_codes = set(codes.replace("/", " ").split())
            self.assertFalse(links_by_entity.get(entity, set()).intersection(rejected_codes), rejected)

    def test_one_source_attribution_is_attached_to_every_geometry_and_located_relations(self):
        evidence_codes = {f["properties"]["evidence_code"] for f in self.units + self.unions}
        self.assertEqual(evidence_codes, {IMPORTER.EVIDENCE_CODE})
        for feature in self.units + self.unions:
            self.assertEqual(feature["properties"]["license"], "CC-BY-IGO")
            self.assertIn("CAPMAS", feature["properties"]["attribution"])
            self.assertIn("CC BY-IGO", feature["properties"]["attribution"])
        self.assertEqual(len(self.relations), 72)
        self.assertEqual(sum(relation["relation"] == "located_within" for relation in self.relations), 7)
        self.assertEqual(sum(relation["relation"] == "governorate" for relation in self.relations), 65)
        self.assertTrue(all(relation["evidence_code"] == IMPORTER.EVIDENCE_CODE for relation in self.relations))

    def test_official_feature_requirements_and_name_fixes(self):
        by_pcode = {feature["properties"]["pcode"]: feature for feature in self.units}
        self.assertEqual(by_pcode["EG0106"]["properties"]["name_ar"], self.links["adm2_display_name_fixes"]["EG0106"])
        self.assertIsNone(by_pcode["EG010601"]["properties"]["name_en"])
        self.assertEqual(by_pcode["EG0106"]["properties"]["source"], IMPORTER.SOURCE)

    def test_generated_artifacts_are_current(self):
        import subprocess
        result = subprocess.run([str(ROOT / ".venv/bin/python"), "scripts/import-codab-boundaries.py", "--check"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
