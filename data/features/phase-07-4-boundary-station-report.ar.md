# تقرير PHASE 07.4 — الحدود والمحطات ومراجعة الطريق الإقليمي

- كيانات المحطات في البذرة: 103؛ الحالات: `{'approved_planned': 1, 'operational': 69, 'planned': 4, 'under_construction': 25, 'unknown': 4}` (المطابق منها فعليًا: 40).
- ميزات نقاط المحطات: 56 قبل → 56 بعد؛ كيانات ذات هندسة: 40 → 40.
- عُقد المحطات المفحوصة: 725؛ ذات أسماء مرشحة في البذرة: 158.
- العُقد المطابقة بعد فحوص الاسم والنوع والخط والحالة: 56؛ الملتبسة: 10؛ المرفوضة: 92.
- لا تُقبل المحطة إلا باسم/اسم بديل مطابق بعد التطبيع، ونوع نقل متوافق، وبُعد لا يتجاوز 600 م عن هندسة الخط المطابق عند توفرها. المحطات المخططة/قيد الإنشاء تتطلب وسم construction ومحاذاة خط متاحة.
- عند وجود عقدة محطة أساسية عالية الجودة، تُستبعد عقدة stop-position/platform الأقل جودة كنسخة فقط إذا كانت ضمن 150 م؛ أما عقد التوقف المتعددة على الخطوط المختلفة أو البعيدة فتبقى منفصلة أو تُرفع للالتباس دون تخمين.

| الخط / المجموعة | كيانات المحطات | كيانات مطابقة | ميزات قبل → بعد | كيانات بلا مطابقة |
|---|---:|---:|---:|---:|
| `MODE-RESOLVED` | 6 | 0 | 0 → 0 | 6 |
  - بلا مطابقة: `STOP-SUN-CAPITAL, STOP-HADAEK-OCTOBER, STOP-6-OCTOBER-INTERCHANGE, STOP-AHMED-OMAR-HASHEM, STOP-SAYEDA-AISHA, STOP-CENTRAL-CAPITAL`
| `RAIL-TRAIN` | 2 | 1 | 1 → 1 | 1 |
  - بلا مطابقة: `RAIL-BASHTIL`
| `TRANSIT-BRT` | 28 | 1 | 1 → 1 | 27 |
  - بلا مطابقة: `STOP-BRT-MAADI, STOP-BRT-ZAHRAA-MAADI, STOP-BRT-MOKATTAM, STOP-BRT-AIN-SOKHNA-RD, STOP-BRT-AUTOSTRAD, STOP-BRT-MANSOURIYA, STOP-BRT-MARYUTEYA, STOP-BRT-TALBIYA, STOP-BRT-OMRANIYA, STOP-BRT-ALEX-AGRI, STOP-BRT-SHARQAWIYA, STOP-BRT-SHUBRA-BENHA, STOP-BRT-BAHTIM, STOP-BRT-MOSTOROD, STOP-BRT-KHOSOUS, STOP-BRT-EL-MARG, STOP-BRT-QALG, STOP-BRT-ZAKAT, STOP-BRT-IBRAHIM-ORABI, STOP-BRT-SALAM, STOP-BRT-SUEZ-RD, STOP-BRT-POLICE-ACADEMY, STOP-BRT-GOLF, STOP-BRT-ALGERIA-ST, STOP-BRT-IMAMAIN, STOP-BRT-ZAHRAA, STOP-BRT-BAHR-AZAM`
| `TRANSIT-HSR-L1` | 1 | 0 | 0 → 0 | 1 |
  - بلا مطابقة: `STOP-HSR-SPHINX`
| `TRANSIT-HSR-L2` | 1 | 0 | 0 → 0 | 1 |
  - بلا مطابقة: `STOP-HSR-GIZA`
| `TRANSIT-LRT` | 20 | 10 | 11 → 11 | 10 |
  - بلا مطابقة: `STOP-ARTS-CULTURE-CITY, STOP-LRT-ROBEIKI, STOP-LRT-10TH-RAMADAN-1, STOP-LRT-NATIVITY-CATHEDRAL, STOP-LRT-STRATEGIC-COMMAND, STOP-LRT-SPORTS-CITY, STOP-LRT-HADAEK-10TH, STOP-LRT-OMAR-KHATTAB, STOP-LRT-10TH-CITY-CENTER, STOP-LRT-TECH-INSTITUTE`
| `TRANSIT-METRO-L1` | 4 | 4 | 4 → 4 | 0 |
| `TRANSIT-METRO-L2` | 4 | 3 | 4 → 4 | 1 |
  - بلا مطابقة: `STOP-M2-ST-TERESA`
| `TRANSIT-METRO-L3` | 6 | 5 | 6 → 6 | 1 |
  - بلا مطابقة: `STOP-M3-ROD-ELFARAG-AXIS`
| `TRANSIT-MONORAIL-EAST` | 21 | 18 | 32 → 32 | 3 |
  - بلا مطابقة: `STOP-ARTS-CULTURE-CITY, STOP-MRE-MOSTATHMERIN, STOP-MRE-LOTUS`
| `TRANSIT-MONORAIL-WEST` | 13 | 0 | 0 → 0 | 13 |
  - بلا مطابقة: `STOP-MRW-NEW-OCTOBER, STOP-MRW-ACU, STOP-MRW-SADAT, STOP-MRW-OCT-UNIV, STOP-MRW-ENGINEERS, STOP-MRW-MALL-OF-EGYPT, STOP-MRW-SHEIKH-ZAYED, STOP-MRW-ALEX-ROAD, STOP-MRW-MANSOURIYA, STOP-MRW-MARYUTEYA, STOP-MRW-RING-ROAD, STOP-MRW-BASHTIL, STOP-MRW-WADI-EL-NIL`

## الكيانات بلا مطابقة مؤكدة

- `RAIL-BASHTIL`: لم تُضف هندسة؛ equally strong station-name matches are more than 600 m apart; no geometry selected.
- `STOP-6-OCTOBER-INTERCHANGE`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-AHMED-OMAR-HASHEM`: لم تُضف هندسة؛ planned/construction entity has no explicit OSM construction tag; planned/construction entity has no explicit OSM construction tag; planned/construction entity has no explicit OSM construction tag.
- `STOP-ARTS-CULTURE-CITY`: لم تُضف هندسة؛ OSM station type does not fit the seeded line; no compatible matched-line geometry supports the generic railway-station tags; OSM station type does not fit the seeded line; no compatible matched-line geometry supports the generic railway-station tags; lower-quality stop-position/platform is within 150 m of the primary station node; treated as duplicate geometry; lower-quality stop-position/platform is within 150 m of the primary station node; treated as duplicate geometry; equally strong station-name matches are more than 600 m apart; no geometry selected.
- `STOP-BRT-AIN-SOKHNA-RD`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-ALEX-AGRI`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-ALGERIA-ST`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-AUTOSTRAD`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-BAHR-AZAM`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-BAHTIM`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-EL-MARG`: لم تُضف هندسة؛ OSM route-relation membership identifies a different line; OSM route-relation membership identifies a different line; OSM station type does not fit the seeded line; no compatible matched-line geometry supports the generic railway-station tags.
- `STOP-BRT-GOLF`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-IBRAHIM-ORABI`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-IMAMAIN`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-KHOSOUS`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-MAADI`: لم تُضف هندسة؛ OSM station type does not fit the seeded line; no compatible matched-line geometry supports the generic railway-station tags; OSM route-relation membership identifies a different line; OSM route-relation membership identifies a different line.
- `STOP-BRT-MANSOURIYA`: لم تُضف هندسة؛ planned/construction entity has no explicit OSM construction tag.
- `STOP-BRT-MARYUTEYA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-MOKATTAM`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-MOSTOROD`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-OMRANIYA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-POLICE-ACADEMY`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-QALG`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-SALAM`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-SHARQAWIYA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-SHUBRA-BENHA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-SUEZ-RD`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-TALBIYA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-BRT-ZAHRAA`: لم تُضف هندسة؛ OSM route-relation membership identifies a different line; OSM route-relation membership identifies a different line; OSM station type does not fit the seeded line; no compatible matched-line geometry supports the generic railway-station tags.
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
- `STOP-LRT-OMAR-KHATTAB`: لم تُضف هندسة؛ planned/construction entity has no explicit OSM construction tag; planned/construction entity has no explicit OSM construction tag; planned/construction entity has no explicit OSM construction tag.
- `STOP-LRT-ROBEIKI`: لم تُضف هندسة؛ OSM station type does not fit the seeded line; no compatible matched-line geometry supports the generic railway-station tags; equally strong station-name matches are more than 600 m apart; no geometry selected.
- `STOP-LRT-SPORTS-CITY`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-LRT-STRATEGIC-COMMAND`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-LRT-TECH-INSTITUTE`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-M2-ST-TERESA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-M3-ROD-ELFARAG-AXIS`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRE-LOTUS`: لم تُضف هندسة؛ OSM station type does not fit the seeded line; no compatible matched-line geometry supports the generic railway-station tags; source node remains ambiguous across multiple seeded station entity codes after filters; source node remains ambiguous across multiple seeded station entity codes after filters; source node remains ambiguous across multiple seeded station entity codes after filters; source node remains ambiguous across multiple seeded station entity codes after filters.
- `STOP-MRE-MOSTATHMERIN`: لم تُضف هندسة؛ OSM station type does not fit the seeded line; no compatible matched-line geometry supports the generic railway-station tags; OSM route-relation membership identifies a different line; OSM route-relation membership identifies a different line; source node remains ambiguous across multiple seeded station entity codes after filters; source node remains ambiguous across multiple seeded station entity codes after filters.
- `STOP-MRW-ACU`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-ALEX-ROAD`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-BASHTIL`: لم تُضف هندسة؛ planned/construction entity has no explicit OSM construction tag; planned/construction entity has no explicit OSM construction tag.
- `STOP-MRW-ENGINEERS`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-MALL-OF-EGYPT`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-MANSOURIYA`: لم تُضف هندسة؛ planned/construction entity has no explicit OSM construction tag.
- `STOP-MRW-MARYUTEYA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-NEW-OCTOBER`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-OCT-UNIV`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-RING-ROAD`: لم تُضف هندسة؛ planned/construction entity has no explicit OSM construction tag.
- `STOP-MRW-SADAT`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-SHEIKH-ZAYED`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-MRW-WADI-EL-NIL`: لم تُضف هندسة؛ construction station is not on an available matched official line alignment within 600 m; planned/construction entity has no explicit OSM construction tag; planned/construction entity has no explicit OSM construction tag; planned/construction entity has no explicit OSM construction tag.
- `STOP-SAYEDA-AISHA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-SUN-CAPITAL`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.

## محطات BRT

- كيانات BRT في البذرة: 28؛ مطابقة: 1؛ بلا مطابقة: 27.
- عقد OSM المسماة BRT/ترددي والموسومة `bus=yes`: 3.
- كيانات مطابقة: `STOP-BRT-MOSHIR-TANTAWY`.
- بلا مطابقة مؤكدة: `STOP-BRT-AIN-SOKHNA-RD, STOP-BRT-ALEX-AGRI, STOP-BRT-ALGERIA-ST, STOP-BRT-AUTOSTRAD, STOP-BRT-BAHR-AZAM, STOP-BRT-BAHTIM, STOP-BRT-EL-MARG, STOP-BRT-GOLF, STOP-BRT-IBRAHIM-ORABI, STOP-BRT-IMAMAIN, STOP-BRT-KHOSOUS, STOP-BRT-MAADI, STOP-BRT-MANSOURIYA, STOP-BRT-MARYUTEYA, STOP-BRT-MOKATTAM, STOP-BRT-MOSTOROD, STOP-BRT-OMRANIYA, STOP-BRT-POLICE-ACADEMY, STOP-BRT-QALG, STOP-BRT-SALAM, STOP-BRT-SHARQAWIYA, STOP-BRT-SHUBRA-BENHA, STOP-BRT-SUEZ-RD, STOP-BRT-TALBIYA, STOP-BRT-ZAHRAA, STOP-BRT-ZAHRAA-MAADI, STOP-BRT-ZAKAT`.
- OSM node/13236416087: `Adly Mansour BRT Stop (westbound)`؛ دون تعيين إلى كيان غير مطابق في البذرة ما لم توجد مطابقة اسمية مؤهلة.
- OSM node/13764358788: `Adly Mansour BRT (eastbound)`؛ دون تعيين إلى كيان غير مطابق في البذرة ما لم توجد مطابقة اسمية مؤهلة.
- OSM node/13764384338: `El-Mosher Tantawy BRT`؛ دون تعيين إلى كيان غير مطابق في البذرة ما لم توجد مطابقة اسمية مؤهلة.

## كيانات بمحطات OSM متعددة

العُقد المتعددة هنا حُفظت فقط بعد مطابقة الاسم والخط والنوع؛ تظهر عدة محطات monorail بعقدتين منفصلتين موسومتين stop-position، كما تظهر مرافق التبادل على خطوط مختلفة مستقلة. لا تعني النقاط المزدوجة استنتاج اتجاه خدمة غير موثق.
- `STOP-ADALA-CITY`: OSM node IDs `[9887149546, 12204487645]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-ADLY-MANSOUR`: OSM node IDs `[9159388948, 9885252635]`؛ الخطوط `['TRANSIT-LRT', 'TRANSIT-METRO-L3']`.
- `STOP-M2-SHUBRA-ELKHEIMA`: OSM node IDs `[272197931, 9164359293]`؛ الخطوط `['TRANSIT-METRO-L2']`.
- `STOP-MRE-7TH-DISTRICT`: OSM node IDs `[12206826987, 12206826988]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-MRE-AHMED-ISMAIL`: OSM node IDs `[12206833925, 12206833926]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-MRE-AIR-HOSPITAL`: OSM node IDs `[12206697336, 12206759934]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-MRE-AZHAR-UNIV`: OSM node IDs `[12206848818, 12206848819]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-MRE-BEIT-EL-WATAN`: OSM node IDs `[12204780997, 12204780998]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-MRE-FATTAH-ALIM`: OSM node IDs `[12204760499, 12204760500]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-MRE-GOLDEN-SQUARE`: OSM node IDs `[12204802780, 12204802781]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-MRE-HISHAM-BARAKAT`: OSM node IDs `[13691445046, 13691445047]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-MRE-JEHAN-SADAT`: OSM node IDs `[12206732996, 12206732997]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-MRE-NARGES`: OSM node IDs `[12206666397, 12206666398]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-MRE-ONE-NINETY`: OSM node IDs `[12206733004, 12206733005]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-MRE-R1`: OSM node IDs `[12204707792, 12204707793]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.
- `STOP-MRE-R2`: OSM node IDs `[8153887878, 12204707225]`؛ الخطوط `['TRANSIT-MONORAIL-EAST']`.

## مواضع ملتبسة لم تُخَمَّن

- `RAIL-BASHTIL`؛ OSM node IDs `[1129560332, 2265692735]`؛ أزواج متباعدة `[{'osm_ids': [1129560332, 2265692735], 'distance_m': 1779.2, 'line_codes': [[], []]}]`. لم تُضف هندسة.
- `STOP-ARTS-CULTURE-CITY`؛ OSM node IDs `[9885200015, 12250242532]`؛ أزواج متباعدة `[{'osm_ids': [9885200015, 12250242532], 'distance_m': 622.0, 'line_codes': [['TRANSIT-LRT'], ['TRANSIT-MONORAIL-EAST']]}]`. لم تُضف هندسة.
- `STOP-LRT-ROBEIKI`؛ OSM node IDs `[768766285, 9885200016]`؛ أزواج متباعدة `[{'osm_ids': [768766285, 9885200016], 'distance_m': 1849.1, 'line_codes': [['TRANSIT-LRT'], ['TRANSIT-LRT']]}]`. لم تُضف هندسة.

## مطابقة الحدود حسب نوع الكيان

| النوع | الكيانات | مطابقة | بلا مطابقة | ملتبسة |
|---|---:|---:|---:|---:|
| `authority` | 18 | 0 | 18 | 0 |
| `city` | 42 | 6 | 36 | 0 |
| `district` | 83 | 4 | 79 | 0 |
- إجمالي مضلعات الحدود المختارة: 10 من OSM؛ لم يُخمن أي مرشح متعادل الأولوية.

## الطريق الدائري الإقليمي — الحافة الغربية

- أُغلقت الحافة عند `(30.5148, 29.7646)` بطرق OSM جديدة؛ الحد الغربي الخاص بالكيان `[30.25, 29.2, 32.35, 30.9]`. لم تعد `source_clipped_edge` قائمة.
- بقيت 1 فجوة طوبولوجية منفصلة في الدائري الإقليمي عند endpoints `[(30.9192163, 30.3587608)]`؛ لا تتصل بالحافة الغربية القديمة المغلقة ولم تُملأ بخط اصطناعي.
