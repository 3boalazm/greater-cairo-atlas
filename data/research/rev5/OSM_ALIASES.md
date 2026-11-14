# Supplementary OSM matcher aliases

The original rev5 Drive bundle is preserved here unchanged. `osm-alias-overrides.json` supplements (does not replace) the owner's researched names and aliases, and `scripts/apply-osm-aliases.py` applies those exact-label aliases to the adapted canonical CSV before matching. The added labels are copied from the stored extract's `name`, `name:ar`, and `name:en` tags; common Metro Line 1/2/3 spellings are also included. No route geometry or status is inferred.

The road aliases requested by the owner are already in rev5 for `ROAD-RING-ROAD` (`الطريق الدائري`, `The Ring Road`) and rev5 also includes the Middle/Regional Ring aliases.
