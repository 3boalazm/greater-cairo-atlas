# Data licensing and attribution

**Policy effective date: 2026-11-18.** This file distinguishes the research material already released under an earlier licence from original research material first published after the effective date. It does not relicense third-party material.

## Existing Atlas research data — legacy CC BY 4.0

All original Atlas research data, facts, evidence records, curation, documentation, and compilations that were published in the repository on or before 2026-11-17, including the canonical seed and the existing research batches that state CC BY 4.0, remain available under the licence originally offered:

> © Mustafa Aboalazm (مصطفى أبوالعزم), CC BY 4.0.

The legacy licence is not withdrawn or retroactively replaced by this policy. Recipients who obtained those materials under CC BY 4.0 may continue exercising the rights granted by that licence, subject to its terms. The current checked-in data exports therefore continue to identify the existing research snapshot as CC BY 4.0.

See <https://creativecommons.org/licenses/by/4.0/>.

## New original research material — CC BY-NC 4.0

Original Atlas research material first published on or after 2026-11-18 by Mustafa Aboalazm, and clearly identified as such in its batch documentation, is licensed under:

> Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).

You may share and adapt that material for non-commercial purposes if you give appropriate credit, link to the licence, and indicate changes. Commercial use is not permitted under this licence; it requires a separate, prior written licence from the rights holder.

Suggested attribution:

> Mustafa Aboalazm, Greater Cairo Atlas, [repository or source-file link], licensed under CC BY-NC 4.0. Changes: [describe changes, or state none].

The CC BY-NC 4.0 licence applies only to copyright and database rights that the rights holder is entitled to license. It does not claim ownership of bare facts, public-domain material, third-party source content, or rights held by other contributors. The NonCommercial restriction is defined by the licence itself; see <https://creativecommons.org/licenses/by-nc/4.0/> and its legal code at <https://creativecommons.org/licenses/by-nc/4.0/legalcode>.

**Release gate:** new NC-licensed material must be labelled at the batch/source level. It must not be merged into the current combined public exports until the export pipeline can preserve mixed licences and emit the correct attribution for each included component. A blanket CC BY 4.0 header must never be used to describe new NC material, and a blanket CC BY-NC 4.0 header must never be used to relicense the legacy snapshot.

## Third-party data and geometry

Third-party material is not relicensed by this policy. Keep its original licence and required attribution:

### OpenStreetMap

> © OpenStreetMap contributors, ODbL 1.0.

OpenStreetMap-derived geometry and derived databases remain subject to ODbL 1.0 and its attribution/share-alike requirements. See <https://www.openstreetmap.org/copyright> and <https://opendatacommons.org/licenses/odbl/1-0/>.

### CAPMAS administrative boundaries via OCHA/HDX

> Administrative boundaries © CAPMAS, via OCHA/HDX (CC BY-IGO).

Preserve the source and attribution recorded in `data/research/codab-boundaries/README.md` and the corresponding geometry metadata. See <https://data.humdata.org/dataset/cod-ab-egy>.

### Transport for Cairo and other sources

The geometry manifest records Transport for Cairo GTFS attribution under CC BY 4.0. If TfC material is included in a release, preserve that separate attribution and licence; do not convert it to CC BY-NC 4.0. Any other source dataset, map, text, image, or document remains under its own terms unless the rights holder has expressly granted additional rights.

## Software code

The software source code is licensed separately under the PolyForm Noncommercial License 1.0.0 in the root [LICENSE](LICENSE). This data licence does not grant software rights, and the software licence does not relicense research data.

## Provenance audit register

The current batch/source inventory and unresolved provenance gaps are recorded in [DATA_PROVENANCE_AUDIT.md](DATA_PROVENANCE_AUDIT.md) and the machine-readable [LICENSE_REGISTER.json](data/research/LICENSE_REGISTER.json). These are audit records, not a per-record licensing implementation. The mixed-licence export release gate remains in force.

## Exports and contact

The current CSV, JSON, GeoJSON, and GeoPackage exports contain the legacy research snapshot and retain its CC BY 4.0 attribution alongside the applicable third-party notices. Future releases containing new CC BY-NC research require licence-aware export metadata before publication.

Commercial licensing requests for material whose rights are held by Mustafa Aboalazm: `3boalazm@gmail.com`.
