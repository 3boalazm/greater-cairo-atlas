# تقرير PHASE 07.4 — الحدود والمحطات ومراجعة الطريق الإقليمي

- كيانات المحطات في البذرة: 178؛ الحالات: `{'approved_planned': 1, 'operational': 148, 'planned': 4, 'under_construction': 25}` (المطابق منها فعليًا: 119).
- ميزات نقاط المحطات: 120 قبل → 120 بعد؛ كيانات ذات هندسة: 119 → 119.
- عُقد المحطات المفحوصة: 769؛ ذات أسماء مرشحة في البذرة: 368.
- العُقد المطابقة بعد فحوص الاسم والنوع والخط والحالة: 136؛ الملتبسة: 11؛ المرفوضة: 221.
- لا تُقبل المحطة إلا باسم/اسم بديل مطابق بعد التطبيع، ونوع نقل متوافق، وبُعد لا يتجاوز 600 م عن هندسة الخط المطابق عند توفرها. المحطات المخططة/قيد الإنشاء تتطلب وسم construction ومحاذاة خط متاحة.
- عند وجود عقدة محطة أساسية عالية الجودة، تُستبعد عقدة stop-position/platform الأقل جودة كنسخة فقط إذا كانت ضمن 150 م؛ أما عقد التوقف المتعددة على الخطوط المختلفة أو البعيدة فتبقى منفصلة أو تُرفع للالتباس دون تخمين.

| الخط / المجموعة | كيانات المحطات | كيانات مطابقة | ميزات قبل → بعد | كيانات بلا مطابقة |
|---|---:|---:|---:|---:|
| `MODE-RESOLVED` | 6 | 0 | 0 → 0 | 6 |
  - بلا مطابقة: `STOP-6-OCTOBER-INTERCHANGE, STOP-AHMED-OMAR-HASHEM, STOP-CENTRAL-CAPITAL, STOP-HADAEK-OCTOBER, STOP-SAYEDA-AISHA, STOP-SUN-CAPITAL`
| `RAIL-TRAIN` | 3 | 2 | 2 → 2 | 1 |
  - بلا مطابقة: `RAIL-BASHTIL`
| `TRANSIT-BRT` | 28 | 1 | 1 → 1 | 27 |
  - بلا مطابقة: `STOP-BRT-AIN-SOKHNA-RD, STOP-BRT-ALEX-AGRI, STOP-BRT-ALGERIA-ST, STOP-BRT-AUTOSTRAD, STOP-BRT-BAHR-AZAM, STOP-BRT-BAHTIM, STOP-BRT-EL-MARG, STOP-BRT-GOLF, STOP-BRT-IBRAHIM-ORABI, STOP-BRT-IMAMAIN, STOP-BRT-KHOSOUS, STOP-BRT-MAADI, STOP-BRT-MANSOURIYA, STOP-BRT-MARYUTEYA, STOP-BRT-MOKATTAM, STOP-BRT-MOSTOROD, STOP-BRT-OMRANIYA, STOP-BRT-POLICE-ACADEMY, STOP-BRT-QALG, STOP-BRT-SALAM, STOP-BRT-SHARQAWIYA, STOP-BRT-SHUBRA-BENHA, STOP-BRT-SUEZ-RD, STOP-BRT-TALBIYA, STOP-BRT-ZAHRAA, STOP-BRT-ZAHRAA-MAADI, STOP-BRT-ZAKAT`
| `TRANSIT-HSR-L1` | 1 | 0 | 0 → 0 | 1 |
  - بلا مطابقة: `STOP-AHMED-OMAR-HASHEM`
| `TRANSIT-HSR-L2` | 1 | 0 | 0 → 0 | 1 |
  - بلا مطابقة: `STOP-HSR-GIZA`
| `TRANSIT-LRT` | 12 | 12 | 13 → 13 | 0 |
| `TRANSIT-METRO-L1` | 35 | 35 | 35 → 35 | 0 |
| `TRANSIT-METRO-L2` | 20 | 20 | 20 → 20 | 0 |
| `TRANSIT-METRO-L3` | 33 | 33 | 31 → 33 | 0 |
| `TRANSIT-MONORAIL-EAST` | 22 | 22 | 23 → 23 | 0 |
| `TRANSIT-MONORAIL-WEST` | 13 | 0 | 0 → 0 | 13 |
  - بلا مطابقة: `STOP-MRW-ACU, STOP-MRW-ALEX-ROAD, STOP-MRW-BASHTIL, STOP-MRW-ENGINEERS, STOP-MRW-MALL-OF-EGYPT, STOP-MRW-MANSOURIYA, STOP-MRW-MARYUTEYA, STOP-MRW-NEW-OCTOBER, STOP-MRW-OCT-UNIV, STOP-MRW-RING-ROAD, STOP-MRW-SADAT, STOP-MRW-SHEIKH-ZAYED, STOP-MRW-WADI-EL-NIL`

## هندسة المحطات من حقائق osm_node_id

- المنهج: `exact osm_node_id fact to exact stored OSM node; group primary IDs from the stored station report; no fuzzy fallback`؛ كيانات لها حقائق: 118؛ أرقام عقد مرجعية: 243؛ المجموعات المطابقة: 119.
- لم تُستبدل العقد المرجعية بمطابقة اسمية. العقدة المخططة التي لا تتوافق مع lifecycle لا تحصل على استثناء.
- محطات بلا وسيلة نقل محددة من line membership أو بادئة الرمز: `['STOP-6-OCTOBER-INTERCHANGE', 'STOP-HADAEK-OCTOBER', 'STOP-SAYEDA-AISHA', 'STOP-SUN-CAPITAL']`؛ لم تُعرض لها وسيلة عامة بديلة.

| الكيان | الحالة | عُقد OSM ذات هندسة |
|---|---|---|
| `RAIL-GIZA-SUBURBS` | `operational` | `[5217365043]` |
| `RAIL-RAMSES` | `operational` | `[271864421]` |
| `STOP-ABBASSIA` | `operational` | `[1235803733]` |
| `STOP-ADALA-CITY` | `operational` | `[9887149546]` |
| `STOP-ADLY-MANSOUR` | `operational` | `[8954572010]` |
| `STOP-ARTS-CULTURE-CITY` | `operational` | `[8953945678, 8153887919]` |
| `STOP-CAIRO-STADIUM` | `operational` | `[1654760266]` |
| `STOP-DEMERDASH` | `operational` | `[1642383282]` |
| `STOP-KIT-KAT` | `operational` | `[10099279487]` |
| `STOP-LRT-BADR` | `operational` | `[8953943083]` |
| `STOP-LRT-CAPITAL-AIRPORT` | `operational` | `[8953945679]` |
| `STOP-LRT-CAPITAL-GARDENS` | `operational` | `[8953945682]` |
| `STOP-LRT-INDUSTRIAL-ZONE` | `operational` | `[8953943113]` |
| `STOP-LRT-KNOWLEDGE-CITY` | `operational` | `[8953943104]` |
| `STOP-LRT-MOSTAKBAL` | `operational` | `[9885252629]` |
| `STOP-LRT-NEW-HELIOPOLIS` | `operational` | `[8953945552]` |
| `STOP-LRT-OBOUR` | `operational` | `[314636753]` |
| `STOP-LRT-ROBEIKI` | `operational` | `[8953945571]` |
| `STOP-LRT-SHOROUK` | `operational` | `[9885252632]` |
| `STOP-M1-AIN-HELWAN` | `operational` | `[316637584]` |
| `STOP-M1-AIN-SHAMS` | `operational` | `[1642286403]` |
| `STOP-M1-AL-MAASARA` | `operational` | `[316638531]` |
| `STOP-M1-AL-MALEK-AL-SALEH` | `operational` | `[2460595904]` |
| `STOP-M1-AL-ZAHRAA` | `operational` | `[493207780]` |
| `STOP-M1-DAR-AL-SALAM` | `operational` | `[316388053]` |
| `STOP-M1-EL-MARG` | `operational` | `[316643120]` |
| `STOP-M1-EL-MATAREYYA` | `operational` | `[316643099]` |
| `STOP-M1-EZBET-EN-NAKHL` | `operational` | `[316643111]` |
| `STOP-M1-GHAMRA` | `operational` | `[316642043]` |
| `STOP-M1-HADAYEK-EL-MAADI` | `operational` | `[5348846066]` |
| `STOP-M1-HADAYEQ-AL-ZAITOUN` | `operational` | `[316643077]` |
| `STOP-M1-HADAYEQ-HELWAN` | `operational` | `[316638393]` |
| `STOP-M1-HAMMAMAT-AL-QOBBA` | `operational` | `[316643069]` |
| `STOP-M1-HELMEYET-AL-ZAITOUN` | `operational` | `[5349031072]` |
| `STOP-M1-HELWAN` | `operational` | `[3755981998]` |
| `STOP-M1-HELWAN-UNIVERSITY` | `operational` | `[316637586]` |
| `STOP-M1-KOBRI-AL-QOBBA` | `operational` | `[316643067]` |
| `STOP-M1-KOZZIKA` | `operational` | `[5194246943]` |
| `STOP-M1-MAADI` | `operational` | `[2208367184]` |
| `STOP-M1-MANSHIET-AL-SADR` | `operational` | `[316642888]` |
| `STOP-M1-MAR-GIRGIS` | `operational` | `[316388031]` |
| `STOP-M1-NASSER` | `operational` | `[316641712]` |
| `STOP-M1-NEW-EL-MARG` | `operational` | `[316643127]` |
| `STOP-M1-ORABI` | `operational` | `[5353485468]` |
| `STOP-M1-SAAD-ZAGHLOUL` | `operational` | `[5349031085]` |
| `STOP-M1-SARAY-AL-QOBBA` | `operational` | `[316643073]` |
| `STOP-M1-SAYYEDA-ZEINAB` | `operational` | `[316639686]` |
| `STOP-M1-THAKANAT-EL-MAADI` | `operational` | `[2208367177]` |
| `STOP-M1-TORA-EL-ASMANT` | `operational` | `[5344953917]` |
| `STOP-M1-TORA-EL-BALAD` | `operational` | `[316638638]` |
| `STOP-M1-WADI-HOF` | `operational` | `[316637588]` |
| `STOP-M2-AL-MEZALLAT` | `operational` | `[6288254841]` |
| `STOP-M2-AL-MOUNIB` | `operational` | `[1131555201]` |
| `STOP-M2-ATTABA` | `operational` | `[317755256]` |
| `STOP-M2-BEHOOTH` | `operational` | `[5355866947]` |
| `STOP-M2-CAIRO-UNIVERSITY` | `operational` | `[316632489]` |
| `STOP-M2-DOKKI` | `operational` | `[9076904709]` |
| `STOP-M2-FAISAL` | `operational` | `[316631596]` |
| `STOP-M2-GIZA` | `operational` | `[316631600]` |
| `STOP-M2-KHALAFAWY` | `operational` | `[316634827]` |
| `STOP-M2-KOLIET-EL-ZERAA` | `operational` | `[1641694429]` |
| `STOP-M2-MASSARA` | `operational` | `[4978060988]` |
| `STOP-M2-MOHAMED-NAGUIB` | `operational` | `[329978615]` |
| `STOP-M2-OMM-EL-MISRYEEN` | `operational` | `[4979416433]` |
| `STOP-M2-OPERA` | `operational` | `[4979414360]` |
| `STOP-M2-RAWD-EL-FARAG` | `operational` | `[4978060979]` |
| `STOP-M2-SAINTE-TERESA` | `operational` | `[4978060976]` |
| `STOP-M2-SAKIAT-MEKKI` | `operational` | `[9076904698]` |
| `STOP-M2-SHUBRA-ELKHEIMA` | `operational` | `[1641694433]` |
| `STOP-M3-ABDOU-PASHA` | `operational` | `[1235803732]` |
| `STOP-M3-AL-AHRAM` | `operational` | `[2400937187]` |
| `STOP-M3-AL-BOHY` | `operational` | `[9077189570]` |
| `STOP-M3-AL-KAWMEIAH` | `operational` | `[9077391794]` |
| `STOP-M3-AL-TAWFIKIA` | `operational` | `[11926766472]` |
| `STOP-M3-ALF-MASKAN-SUBWAY` | `operational` | `[7153641095]` |
| `STOP-M3-ATTABA-SUBWAY` | `operational` | `[5194348150]` |
| `STOP-M3-BAB-EL-SHAARIA` | `operational` | `[1235803722]` |
| `STOP-M3-BULAQ-AL-DAKROUR` | `operational` | `[11923472302]` |
| `STOP-M3-CAIRO-FAIRGROUND` | `operational` | `[1654760303]` |
| `STOP-M3-EL-GEISH` | `operational` | `[1235803723]` |
| `STOP-M3-EL-HAYKESTEP` | `operational` | `[7559190660]` |
| `STOP-M3-EL-NOZHA` | `operational` | `[7559205785]` |
| `STOP-M3-EL-SHAMS-CLUB` | `operational` | `[7302135246]` |
| `STOP-M3-GAMET-EL-DOWEL` | `operational` | `[11923472281]` |
| `STOP-M3-HAROUN` | `operational` | `[7308408910]` |
| `STOP-M3-HELIOPOLIS-SUBWAY` | `operational` | `[7302135248]` |
| `STOP-M3-HESHAM-BARAKAT` | `operational` | `[7559190677]` |
| `STOP-M3-IMBABA` | `operational` | `[9077189581]` |
| `STOP-M3-KOLEYET-EL-BANAT` | `operational` | `[1654764997]` |
| `STOP-M3-MASBERO` | `operational` | `[9077161247]` |
| `STOP-M3-OMAR-EBN-ELKHATAB` | `operational` | `[7559190666]` |
| `STOP-M3-QUBAA` | `operational` | `[7559190674]` |
| `STOP-M3-RING-ROAD` | `operational` | `[9077274203]` |
| `STOP-M3-SAFAA-HEGAZY` | `operational` | `[9077189601]` |
| `STOP-M3-SUDAN` | `operational` | `[9077161277]` |
| `STOP-M3-WADI-EL-NILE` | `operational` | `[11923457958]` |
| `STOP-MONORAIL-MOSHIR-TANTAWY` | `operational` | `[12206762833]` |
| `STOP-MRE-7TH-DISTRICT` | `operational` | `[12206826987]` |
| `STOP-MRE-AHMED-ISMAIL` | `operational` | `[12206833925]` |
| `STOP-MRE-AIR-HOSPITAL` | `operational` | `[12206697336]` |
| `STOP-MRE-AZHAR-UNIV` | `operational` | `[12206848818]` |
| `STOP-MRE-BEIT-EL-WATAN` | `operational` | `[12204780997]` |
| `STOP-MRE-CAIRO-STADIUM-MONORAIL` | `operational` | `[8153781067]` |
| `STOP-MRE-CBD` | `operational` | `[12204710521]` |
| `STOP-MRE-FATTAH-ALIM` | `operational` | `[12204760499]` |
| `STOP-MRE-GOLDEN-SQUARE` | `operational` | `[12204802780]` |
| `STOP-MRE-GOV-DISTRICT` | `operational` | `[8153887924]` |
| `STOP-MRE-HISHAM-BARAKAT` | `operational` | `[13691445046]` |
| `STOP-MRE-JEHAN-SADAT` | `operational` | `[12206732996]` |
| `STOP-MRE-LOTUS` | `operational` | `[12204816177]` |
| `STOP-MRE-MISR-MOSQUE` | `operational` | `[12204326294]` |
| `STOP-MRE-MOSTATHMERIN` | `operational` | `[12206658462]` |
| `STOP-MRE-NARGES` | `operational` | `[12206666397]` |
| `STOP-MRE-ONE-NINETY` | `operational` | `[12206733004]` |
| `STOP-MRE-R1` | `operational` | `[12204707792]` |
| `STOP-MRE-R2` | `operational` | `[8153887878]` |
| `STOP-SADAT` | `operational` | `[5194295704]` |
| `STOP-SHUHADA` | `operational` | `[5194295702]` |
- `TRANSIT-LRT`: مجموعات 12؛ هندسة متاحة 12.
- `TRANSIT-METRO-L1`: مجموعات 35؛ هندسة متاحة 35.
- `TRANSIT-METRO-L2`: مجموعات 20؛ هندسة متاحة 20.
- `TRANSIT-METRO-L3`: مجموعات 33؛ هندسة متاحة 33.
- `TRANSIT-MONORAIL-EAST`: مجموعات 22؛ هندسة متاحة 22.

## الكيانات بلا مطابقة مؤكدة

- `RAIL-BASHTIL`: لم تُضف هندسة؛ equally strong station-name matches are more than 600 m apart; no geometry selected.
- `STOP-6-OCTOBER-INTERCHANGE`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-AHMED-OMAR-HASHEM`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
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
- `STOP-LRT-SPORTS-CITY`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-LRT-STRATEGIC-COMMAND`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-LRT-TECH-INSTITUTE`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-M2-ST-TERESA`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
- `STOP-M3-ROD-ELFARAG-AXIS`: لم تُضف هندسة؛ no exact normalized name/alias match in the supplied OSM station nodes, or no source point passed the line/lifecycle guards.
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
- عقد OSM المسماة BRT/ترددي والموسومة `bus=yes`: 2.
- كيانات مطابقة: `STOP-BRT-MOSHIR-TANTAWY`.
- بلا مطابقة مؤكدة: `STOP-BRT-AIN-SOKHNA-RD, STOP-BRT-ALEX-AGRI, STOP-BRT-ALGERIA-ST, STOP-BRT-AUTOSTRAD, STOP-BRT-BAHR-AZAM, STOP-BRT-BAHTIM, STOP-BRT-EL-MARG, STOP-BRT-GOLF, STOP-BRT-IBRAHIM-ORABI, STOP-BRT-IMAMAIN, STOP-BRT-KHOSOUS, STOP-BRT-MAADI, STOP-BRT-MANSOURIYA, STOP-BRT-MARYUTEYA, STOP-BRT-MOKATTAM, STOP-BRT-MOSTOROD, STOP-BRT-OMRANIYA, STOP-BRT-POLICE-ACADEMY, STOP-BRT-QALG, STOP-BRT-SALAM, STOP-BRT-SHARQAWIYA, STOP-BRT-SHUBRA-BENHA, STOP-BRT-SUEZ-RD, STOP-BRT-TALBIYA, STOP-BRT-ZAHRAA, STOP-BRT-ZAHRAA-MAADI, STOP-BRT-ZAKAT`.
- OSM node/13764358788: `Adly Mansour BRT (eastbound)`؛ دون تعيين إلى كيان غير مطابق في البذرة ما لم توجد مطابقة اسمية مؤهلة.
- OSM node/13764384338: `El-Mosher Tantawy BRT`؛ دون تعيين إلى كيان غير مطابق في البذرة ما لم توجد مطابقة اسمية مؤهلة.

## كيانات بمحطات OSM متعددة

العُقد المتعددة هنا حُفظت فقط بعد مطابقة الاسم والخط والنوع؛ تظهر عدة محطات monorail بعقدتين منفصلتين موسومتين stop-position، كما تظهر مرافق التبادل على خطوط مختلفة مستقلة. لا تعني النقاط المزدوجة استنتاج اتجاه خدمة غير موثق.
- `STOP-ARTS-CULTURE-CITY`: OSM node IDs `[8953945678, 8153887919]`؛ الخطوط `['TRANSIT-LRT', 'TRANSIT-MONORAIL-EAST']`.

## مواضع ملتبسة لم تُخَمَّن

- `RAIL-BASHTIL`؛ OSM node IDs `[1129560332, 2265692735]`؛ أزواج متباعدة `[{'osm_ids': [1129560332, 2265692735], 'distance_m': 1779.2, 'line_codes': [[], []]}]`. لم تُضف هندسة.
- `STOP-ARTS-CULTURE-CITY`؛ OSM node IDs `[9885200015, 12250242532]`؛ أزواج متباعدة `[{'osm_ids': [9885200015, 12250242532], 'distance_m': 622.0, 'line_codes': [['TRANSIT-LRT'], ['TRANSIT-MONORAIL-EAST']]}]`. لم تُضف هندسة.
- `STOP-LRT-ROBEIKI`؛ OSM node IDs `[768766285, 9885200016]`؛ أزواج متباعدة `[{'osm_ids': [768766285, 9885200016], 'distance_m': 1849.1, 'line_codes': [['TRANSIT-LRT'], ['TRANSIT-LRT']]}]`. لم تُضف هندسة.

## مطابقة الحدود حسب نوع الكيان

| النوع | الكيانات | مطابقة | بلا مطابقة | ملتبسة |
|---|---:|---:|---:|---:|
| `authority` | 18 | 0 | 18 | 0 |
| `city` | 42 | 13 | 29 | 0 |
| `district` | 83 | 6 | 77 | 0 |
- إجمالي مضلعات الحدود المختارة: 19 من OSM؛ لم يُخمن أي مرشح متعادل الأولوية.

## الطريق الدائري الإقليمي — الحافة الغربية

- أُغلقت الحافة عند `(30.5148, 29.7646)` بطرق OSM جديدة؛ الحد الغربي الخاص بالكيان `[30.25, 29.2, 32.35, 30.9]`. لم تعد `source_clipped_edge` قائمة.
- بقيت 1 فجوة طوبولوجية منفصلة في الدائري الإقليمي عند endpoints `[(30.9192163, 30.3587608)]`؛ لا تتصل بالحافة الغربية القديمة المغلقة ولم تُملأ بخط اصطناعي.
