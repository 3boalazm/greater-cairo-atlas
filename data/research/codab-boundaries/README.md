# Official admin boundaries — CAPMAS COD-AB (Cairo, Giza, Qalyubia)

- Source: Egypt – Subnational Administrative Boundaries (cod-ab-egy), https://data.humdata.org/dataset/cod-ab-egy
- Publisher: CAPMAS (Central Agency for Public Mobilization and Statistics); contributed by OCHA ROMENA; published by OCHA FIS / HDX
- Licence: CC BY-IGO. Attribution required: "Administrative boundaries © CAPMAS, via OCHA/HDX (CC BY-IGO)"
- Boundaries created 2017-08-14; reviewed for accuracy 2024-12-19; accessed 2026-11-15
- Original: egy_admin_boundaries.geojson.zip, 16,949,803 bytes, sha256 259987be0b7c5e367d52eadf3dfea39802c7750cace8498833e3212d61b9dba9
- Extract: data/raw/cairo-codab-adm2-adm3-2026-11-15.geojson.gz (gz sha256 50801f24817eaa789b8fd46091c21253241c676d1af4ca2572a14b54a7f104b5; json sha256 99747d8536238f4e719e7f44184df947f95093d65463828eabcd01dfc0f01da2)
  - Filter: adm1_pcode in EG01 Cairo, EG21 Giza, EG14 Qalyubia; levels 2 (qism/markaz) and 3 (shiakha/village); coordinates rounded to 1e-5; properties trimmed
  - 858 features: adm2 Cairo 42, Giza 22, Qalyubia 15; adm3 Cairo 324, Giza 239, Qalyubia 216
- Caveats: adm3 has Arabic names only; some Arabic names lack spaces (fixes for adm2 in entity_links.json); qism units are statistical/police units, not always identical to a municipal "hay".
- entity_links.json: curated links — `boundary_equals_union` (65 entities: the entity's boundary is the union of the listed units) and `located_within` (7). Rejected false name matches are listed and must not be used.
