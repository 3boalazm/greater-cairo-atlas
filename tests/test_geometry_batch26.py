"""Offline idempotence and collision regression for the Batch 26 importer.

CI does not run this test (it needs the repo data files); run it locally with
`python3 tests/test_geometry_batch26.py`.
"""
import copy
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/geometry_batch26.py'
FEATURES = ROOT / 'data/features/features.geojson'
DERIVED = ROOT / 'data/derived/entity-map-geometries.json'
MANIFEST = ROOT / 'data/features/manifest.json'
REPORT = ROOT / 'data/research/geometry-batch26/geometry_import_report.json'
PATHS = [FEATURES, DERIVED, MANIFEST, REPORT]


def digest(root: Path) -> list[str]:
    return [hashlib.sha256((root / path.relative_to(ROOT)).read_bytes()).hexdigest() for path in PATHS]


def copy_repo_subset(root: Path) -> None:
    shutil.copytree(ROOT / 'scripts', root / 'scripts', ignore=shutil.ignore_patterns('__pycache__'))
    (root / 'data').mkdir()
    (root / 'data/raw').symlink_to(ROOT / 'data/raw', target_is_directory=True)
    for relative in [
        'data/features/features.geojson',
        'data/features/codab-admin-units.geojson',
        'data/features/manifest.json',
        'data/derived/entity-map-geometries.json',
        'data/research/geometry-batch26/accepts.json',
        'data/research/geometry-batch26/geometry_import_report.json',
        'data/seed/entities.csv',
    ]:
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)


def run_importer(root: Path, scan: bool = False) -> subprocess.CompletedProcess:
    args = [sys.executable, str(root / 'scripts/geometry_batch26.py')]
    if scan:
        args.append('--scan')
    return subprocess.run(args, check=False, cwd=root, capture_output=True, text=True)


class GeometryBatch26Test(unittest.TestCase):
    def test_rerun_is_byte_idempotent_and_scan_changes_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            copy_repo_subset(root)
            before = digest(root)

            first = run_importer(root)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(digest(root), before)  # first run changes nothing: all 30 already imported

            second = run_importer(root)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(digest(root), before)  # second run is byte-identical too

            scan_before = digest(root)
            scanned = run_importer(root, scan=True)
            self.assertEqual(scanned.returncode, 0, scanned.stderr)
            self.assertEqual(digest(root), scan_before)  # --scan changes nothing

    def test_tampered_feature_is_refused_with_feature_collision(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            copy_repo_subset(root)
            run_importer(root)  # normalize: everything already imported, nothing changes

            collection = json.loads((root / 'data/features/features.geojson').read_text(encoding='utf-8'))
            feature = next(item for item in collection['features'] if item['id'].startswith('BATCH26-'))
            tampered = copy.deepcopy(feature)
            tampered['properties']['osm_version'] += 1
            index = collection['features'].index(feature)
            collection['features'][index] = tampered
            (root / 'data/features/features.geojson').write_text(json.dumps(collection, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

            before = digest(root)
            run = run_importer(root)
            self.assertNotEqual(run.returncode, 0, 'expected the tampered run to fail')
            self.assertIn('feature collision', run.stderr)
            self.assertEqual(digest(root), before)  # the failed run writes nothing


if __name__ == '__main__':
    unittest.main()
