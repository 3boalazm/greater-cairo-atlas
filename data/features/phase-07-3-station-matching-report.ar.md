# تقرير PHASE 07.3 — مطابقة محطات OSM

- كيانات المحطات في البذرة: 103؛ الحالات: `{'approved_planned': 1, 'operational': 69, 'planned': 4, 'under_construction': 25, 'unknown': 4}` (المطابق منها فعليًا: 25).
- ميزات نقاط المحطات: 4 قبل → 27 بعد؛ كيانات ذات هندسة: 3 → 25.
- عُقد المحطات المفحوصة: 437؛ ذات أسماء مرشحة في البذرة: 42.
- العُقد المطابقة بعد فحوص الاسم والنوع والخط والحالة: 27؛ الملتبسة: 6؛ المرفوضة: 9.
- لا تُقبل المحطة إلا باسم/اسم بديل مطابق بعد التطبيع، ونوع نقل متوافق، وبُعد لا يتجاوز 600 م عن هندسة الخط المطابق عند توفرها. المحطات المخططة/قيد الإنشاء تتطلب وسم construction ومحاذاة خط متاحة.

| الخط / المجموعة | كيانات المحطات | كيانات مطابقة | ميزات قبل → بعد | كيانات بلا مطابقة |
|---|---:|---:|---:|---:|
| `MODE-RESOLVED` | 7 | 0 | 0 → 0 | 7 |
  - بلا مطابقة: `STOP-ADALA-CITY, STOP-SUN-CAPITAL, STOP-HADAEK-OCTOBER, STOP-6-OCTOBER-INTERCHANGE, STOP-AHMED-OMAR-HASHEM, STOP-SAYEDA-AISHA, STOP-CENTRAL-CAPITAL`
| `RAIL-TRAIN` | 2 | 1 | 3 → 1 | 1 |
  - بلا مطابقة: `RAIL-BASHTIL`
| `TRANSIT-HSR-L1` | 1 | 0 | 0 → 0 | 1 |
  - بلا مطابقة: `STOP-HSR-SPHINX`
| `TRANSIT-HSR-L2` | 1 | 0 | 0 → 0 | 1 |
  - بلا مطابقة: `STOP-HSR-GIZA`
| `TRANSIT-LRT` | 20 | 10 | 1 → 11 | 10 |
  - بلا مطابقة: `STOP-ARTS-CULTURE-CITY, STOP-LRT-ROBEIKI, STOP-LRT-10TH-RAMADAN-1, STOP-LRT-NATIVITY-CATHEDRAL, STOP-LRT-STRATEGIC-COMMAND, STOP-LRT-SPORTS-CITY, STOP-LRT-HADAEK-10TH, STOP-LRT-OMAR-KHATTAB, STOP-LRT-10TH-CITY-CENTER, STOP-LRT-TECH-INSTITUTE`
| `TRANSIT-METRO-L1` | 4 | 4 | 0 → 4 | 0 |
| `TRANSIT-METRO-L2` | 4 | 3 | 0 → 4 | 1 |
  - بلا مطابقة: `STOP-M2-ST-TERESA`
| `TRANSIT-METRO-L3` | 6 | 5 | 0 → 6 | 1 |
  - بلا مطابقة: `STOP-M3-ROD-ELFARAG-AXIS`
| `TRANSIT-MONORAIL-EAST` | 20 | 4 | 0 → 4 | 16 |
  - بلا مطابقة: `STOP-ARTS-CULTURE-CITY, STOP-MRE-HISHAM-BARAKAT, STOP-MRE-AZHAR-UNIV, STOP-MRE-7TH-DISTRICT, STOP-MRE-AHMED-ISMAIL, STOP-MRE-JEHAN-SADAT, STOP-MRE-ONE-NINETY, STOP-MRE-AIR-HOSPITAL, STOP-MRE-NARGES, STOP-MRE-MOSTATHMERIN, STOP-MRE-LOTUS, STOP-MRE-GOLDEN-SQUARE, STOP-MRE-BEIT-EL-WATAN, STOP-MRE-FATTAH-ALIM, STOP-MRE-R1, STOP-MRE-R2`
| `TRANSIT-MONORAIL-WEST` | 13 | 0 | 0 → 0 | 13 |
  - بلا مطابقة: `STOP-MRW-NEW-OCTOBER, STOP-MRW-ACU, STOP-MRW-SADAT, STOP-MRW-OCT-UNIV, STOP-MRW-ENGINEERS, STOP-MRW-MALL-OF-EGYPT, STOP-MRW-SHEIKH-ZAYED, STOP-MRW-ALEX-ROAD, STOP-MRW-MANSOURIYA, STOP-MRW-MARYUTEYA, STOP-MRW-RING-ROAD, STOP-MRW-BASHTIL, STOP-MRW-WADI-EL-NIL`
| `UNSUPPORTED-LINE` | 28 | 0 | 0 → 0 | 28 |
  - بلا مطابقة: `STOP-BRT-MAADI, STOP-BRT-ZAHRAA-MAADI, STOP-BRT-MOKATTAM, STOP-BRT-AIN-SOKHNA-RD, STOP-BRT-AUTOSTRAD, STOP-BRT-MANSOURIYA, STOP-BRT-MARYUTEYA, STOP-BRT-TALBIYA, STOP-BRT-OMRANIYA, STOP-BRT-ALEX-AGRI, STOP-BRT-SHARQAWIYA, STOP-BRT-SHUBRA-BENHA, STOP-BRT-BAHTIM, STOP-BRT-MOSTOROD, STOP-BRT-KHOSOUS, STOP-BRT-EL-MARG, STOP-BRT-QALG, STOP-BRT-ZAKAT, STOP-BRT-IBRAHIM-ORABI, STOP-BRT-SALAM, STOP-BRT-SUEZ-RD, STOP-BRT-POLICE-ACADEMY, STOP-BRT-MOSHIR-TANTAWY, STOP-BRT-GOLF, STOP-BRT-ALGERIA-ST, STOP-BRT-IMAMAIN, STOP-BRT-ZAHRAA, STOP-BRT-BAHR-AZAM`

## الكيانات بلا مطابقة مؤكدة

- `RAIL-BASHTIL`: لم تُضف هندسة؛ equally strong station-name matches are more than 600 m apart; no geometry selected.
- `STOP-6-OCTOBER-INTERCHANGE`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-ADALA-CITY`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-AHMED-OMAR-HASHEM`: لم تُضف هندسة؛ planned/construction entity has no explicit OSM construction tag.
- `STOP-ARTS-CULTURE-CITY`: لم تُضف هندسة؛ equally strong station-name matches are more than 600 m apart; no geometry selected.
- `STOP-BRT-AIN-SOKHNA-RD`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-ALEX-AGRI`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-ALGERIA-ST`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-AUTOSTRAD`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-BAHR-AZAM`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-BAHTIM`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-EL-MARG`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-GOLF`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-IBRAHIM-ORABI`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-IMAMAIN`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-KHOSOUS`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-MAADI`: لم تُضف هندسة؛ seed line is outside the supported subway/light_rail/monorail/train node scope.
- `STOP-BRT-MANSOURIYA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-MARYUTEYA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-MOKATTAM`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-MOSHIR-TANTAWY`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-MOSTOROD`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-OMRANIYA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-POLICE-ACADEMY`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-QALG`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-SALAM`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-SHARQAWIYA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-SHUBRA-BENHA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-SUEZ-RD`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-TALBIYA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-ZAHRAA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-ZAHRAA-MAADI`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-ZAKAT`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-CENTRAL-CAPITAL`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-HADAEK-OCTOBER`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-HSR-GIZA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-HSR-SPHINX`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-LRT-10TH-CITY-CENTER`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-LRT-10TH-RAMADAN-1`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-LRT-HADAEK-10TH`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-LRT-NATIVITY-CATHEDRAL`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-LRT-OMAR-KHATTAB`: لم تُضف هندسة؛ planned/construction entity has no explicit OSM construction tag.
- `STOP-LRT-ROBEIKI`: لم تُضف هندسة؛ equally strong station-name matches are more than 600 m apart; no geometry selected.
- `STOP-LRT-SPORTS-CITY`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-LRT-STRATEGIC-COMMAND`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-LRT-TECH-INSTITUTE`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-M2-ST-TERESA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-M3-ROD-ELFARAG-AXIS`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-7TH-DISTRICT`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-AHMED-ISMAIL`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-AIR-HOSPITAL`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-AZHAR-UNIV`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-BEIT-EL-WATAN`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-FATTAH-ALIM`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-GOLDEN-SQUARE`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-HISHAM-BARAKAT`: لم تُضف هندسة؛ OSM station type does not fit the seeded line; no compatible matched-line geometry supports the generic railway-station tags.
- `STOP-MRE-JEHAN-SADAT`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-LOTUS`: لم تُضف هندسة؛ OSM station type does not fit the seeded line; no compatible matched-line geometry supports the generic railway-station tags.
- `STOP-MRE-MOSTATHMERIN`: لم تُضف هندسة؛ OSM station type does not fit the seeded line; no compatible matched-line geometry supports the generic railway-station tags.
- `STOP-MRE-NARGES`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-ONE-NINETY`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-R1`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-R2`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-ACU`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-ALEX-ROAD`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-BASHTIL`: لم تُضف هندسة؛ planned/construction entity has no explicit OSM construction tag; planned/construction entity has no explicit OSM construction tag.
- `STOP-MRW-ENGINEERS`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-MALL-OF-EGYPT`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-MANSOURIYA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-MARYUTEYA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-NEW-OCTOBER`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-OCT-UNIV`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-RING-ROAD`: لم تُضف هندسة؛ planned/construction entity has no explicit OSM construction tag.
- `STOP-MRW-SADAT`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-SHEIKH-ZAYED`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-WADI-EL-NIL`: لم تُضف هندسة؛ planned/construction entity has no explicit OSM construction tag.
- `STOP-SAYEDA-AISHA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-SUN-CAPITAL`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.

## مواضع ملتبسة لم تُخَمَّن

- `RAIL-BASHTIL`؛ OSM node IDs `[1129560332, 2265692735]`؛ أزواج متباعدة `[{'osm_ids': [1129560332, 2265692735], 'distance_m': 1779.2, 'line_codes': [[], []]}]`. لم تُضف هندسة.
- `STOP-ARTS-CULTURE-CITY`؛ OSM node IDs `[9885200015, 12250242532]`؛ أزواج متباعدة `[{'osm_ids': [9885200015, 12250242532], 'distance_m': 622.0, 'line_codes': [['TRANSIT-LRT'], ['TRANSIT-MONORAIL-EAST']]}]`. لم تُضف هندسة.
- `STOP-LRT-ROBEIKI`؛ OSM node IDs `[768766285, 9885200016]`؛ أزواج متباعدة `[{'osm_ids': [768766285, 9885200016], 'distance_m': 1849.1, 'line_codes': [['TRANSIT-LRT'], ['TRANSIT-LRT']]}]`. لم تُضف هندسة.

## حافة الطريق الإقليمي الغربية

- الطرف `(30.5148, 29.7646)` مصنف `source_clipped_edge`: المستخلصات تنتهي عند lon 30.5؛ ليست فجوة شبكة. أُجّلت معالجة الهندسة حتى استلام المستخلص الإضافي.
