# Greater Cairo Atlas — Seed revision 7 · CHANGELOG

## rev7 — 2026-11-14 (تنفيذ REV7_HANDOFF.md)

Baseline: rev6.2. المدخل: REV7_HANDOFF.md (روابط اتراجعت بواسطة المدير/Perplexity). استخدمت **الروابط اللي في الـ handoff بس**، والسكريبت بيتأكد إن كل رابط جديد أو متصلح موجود في قايمة الـ handoff. مفيش أي كيان أو حقيقة أو دليل اتمسح أو اتغير نوعه أو اتعاد استخدام كوده. نفس الأعمدة والصيغ.

| | rev6.2 | rev7 |
|---|---|---|
| Entities | 342 | 342 |
| Facts | 1348 | 1391 (+43) |
| Evidence | 324 | 350 (+26) |
| روابط حقيقة→دليل | 1460 | 1505 |
| Status unknown | 45 | **17** |
| verified | 331 | 331 |
| candidate | 767 | 742 |
| single_source | 98 | 135 |
| corroborated | 30 | 32 |
| disputed | 98 | 96 |
| superseded | 16 | 47 |
| rejected | 8 | 8 |

حالة الكيانات: operational 272 · under_construction 37 · unknown 17 · planned 8 · partial 5 · approved_planned 3.

### اختلافات عن الـ handoff
- **ترقيم الأدلة:** الـ handoff بيقول تبدأ من EV-305، بس EV-305…EV-323 موجودين فعلاً (rev6.1 وrev6.2). عشان قاعدة «مفيش كود يتعاد استخدامه»، الأدلة الجديدة بدأت من **EV-324** (EV-324…EV-349).
- **TRANSIT-MONORAIL-WEST** كان under_construction من rev6.2 (مش planned زي ما الـ handoff افترض)، فحالته ماتغيرتش. اتضافت حقيقة under_construction جديدة corroborated (EV-046 + EV-347)، وحقائق الطول والمحطات والقطارات. حقائق الحالة الموجودة بنفس القيمة فضلت زي ما هي، ومحطات الخط ماتلمستش.
- **عدد unknown:** نزل من 45 لـ **17** (الـ handoff توقع حوالي 16). اتغيرت حالة 28 كيان. ROAD-AMR-IBN-ALAS وCITY-MOSTAKBAL فضلوا unknown بناءً على التعليمات، واتضافلهم حقائق اختيارية.
- **روابط موجودة قبل كده:** رابط صفحة الرئاسة للأوسطي موجود من rev4 في EV-082. حقائق العين السخنة والفيوم والواحات اترابطت بـ EV-082 بدل ما يتعمل سجل مكرر رقم تالت لنفس الصفحة (EV-208 كمان بنفس الرابط). EV-045 اتسجله نفس الرابط بناءً على B.
- **verification_state:** حقائق تغيير الحالة اتسجلت single_source (أو corroborated لو المصدرين اتنين) زي ما الـ handoff حدد، حتى لو المصدر رسمي. الحقائق التانية (مش حالة) من روابط رسمية اتسجلت candidate، لأني مافتحتش الصفحات بنفسي في الـ rev ده. ومفيش حقيقة جديدة verified.

### A. تغييرات الحالة (28)
| entity | قديم → جديد | evidence |
|---|---|---|
| ROAD-AIN-SOKHNA | unknown → **operational** | EV-082 |
| ROAD-CAIRO-FAYOUM | unknown → **operational** | EV-082 |
| ROAD-WAHAT | unknown → **operational** | EV-082 |
| ROAD-MOHAMED-NAGUIB | unknown → **operational** | EV-327 |
| ROAD-MBZ-SOUTH | unknown → **operational** | EV-328 |
| ROAD-CAIRO-ALEX-DESERT | unknown → **operational** | EV-328 |
| STOP-SADAT | unknown → **operational** | EV-329 |
| STOP-DEMERDASH | unknown → **operational** | EV-329 |
| STOP-ABBASSIA | unknown → **operational** | EV-329 |
| STOP-LRT-10TH-RAMADAN-1 | unknown → **operational** | EV-330 |
| CITY-MADINATY | unknown → **operational** | EV-331 |
| CITY-REHAB | unknown → **operational** | EV-332 |
| CITY-NEW-HELIOPOLIS | unknown → **partial** | EV-333 |
| DIST-JURIAN | unknown → **under_construction** | EV-334 |
| DIST-TAHRIR | unknown → **operational** | EV-335 |
| DIST-MANIAL | unknown → **operational** | EV-336 |
| DIST-MERAJ | unknown → **operational** | EV-337 |
| DIST-DOWNTOWN | unknown → **operational** | EV-338 |
| DIST-FUSTAT | unknown → **operational** | EV-338 |
| DIST-HUSSEIN-AZHAR | unknown → **operational** | EV-339 |
| DIST-OM-BAYOUMI | unknown → **operational** | EV-340 |
| DIST-NARGES | unknown → **operational** | EV-341 |
| DIST-DEGLA | unknown → **operational** | EV-342 |
| DIST-ZAHRAA-MAADI | unknown → **operational** | EV-343 |
| DIST-NEW-MAADI | unknown → **operational** | EV-343 |
| DIST-SMART-VILLAGE | unknown → **operational** | EV-344 |
| DIST-MIT-ELEZZ | unknown → **operational** | EV-345 |
| DIST-DAQADOS | unknown → **operational** | EV-346 |

**تنبيهات:**
- STOP-LRT-10TH-RAMADAN-1: صفحة محافظة القاهرة بتذكر المحطة بالاسم بس. حقيقتين disputed قدام (under_construction من NAT، EV-074/EV-092) بقوا superseded بناءً على قاعدة الـ handoff. تعارض C17 (هل ده نفس محطة نهاية المرحلة الرابعة؟) محتاج مراجعة تحريرية.
- DIST-MIT-ELEZZ وDIST-DAQADOS: اتضافت حقيقة location_note (مركز ميت غمر، الدقهلية، خارج القاهرة الكبرى نفسها).
- DIST-TAHRIR: حقيقة ChatGPT اللي كانت rejected فضلت rejected.

### حقائق حالة قديمة اتقلبت superseded (31)
- ROAD-AIN-SOKHNA · operational_status = operational (EV-280): candidate → superseded
- ROAD-CAIRO-FAYOUM · operational_status = operational (EV-326): candidate → superseded
- ROAD-WAHAT · operational_status = operational (EV-269): candidate → superseded
- ROAD-MOHAMED-NAGUIB · operational_status = operational (EV-275): candidate → superseded
- ROAD-MBZ-SOUTH · operational_status = operational (EV-281): candidate → superseded
- ROAD-CAIRO-ALEX-DESERT · operational_status = operational (EV-285): candidate → superseded
- STOP-SADAT · operational_status = operational (EV-290): candidate → superseded
- STOP-DEMERDASH · operational_status = operational (EV-293): candidate → superseded
- STOP-ABBASSIA · operational_status = operational (EV-294): candidate → superseded
- STOP-LRT-10TH-RAMADAN-1 · operational_status = operational (EV-051): disputed → superseded
- STOP-LRT-10TH-RAMADAN-1 · operational_status = under_construction (EV-074,EV-092): disputed → superseded
- STOP-LRT-10TH-RAMADAN-1 · operational_status = under_construction (EV-291): candidate → superseded
- CITY-MADINATY · operational_status = operational (EV-278): candidate → superseded
- CITY-REHAB · operational_status = operational (EV-237): candidate → superseded
- CITY-NEW-HELIOPOLIS · operational_status = operational (EV-295): candidate → superseded
- DIST-JURIAN · operational_status = under_construction (EV-301): candidate → superseded
- DIST-TAHRIR · operational_status = operational (EV-264): candidate → superseded
- DIST-MANIAL · operational_status = operational (EV-297): candidate → superseded
- DIST-MERAJ · operational_status = operational (EV-230): candidate → superseded
- DIST-DOWNTOWN · operational_status = operational (EV-263): single_source → superseded
- DIST-DOWNTOWN · operational_status = operational (EV-264): candidate → superseded
- DIST-FUSTAT · operational_status = operational (EV-296): candidate → superseded
- DIST-HUSSEIN-AZHAR · operational_status = operational (EV-264): candidate → superseded
- DIST-OM-BAYOUMI · operational_status = operational (EV-298): candidate → superseded
- DIST-NARGES · operational_status = operational (EV-232): candidate → superseded
- DIST-DEGLA · operational_status = operational (EV-299): candidate → superseded
- DIST-ZAHRAA-MAADI · operational_status = operational (EV-299): candidate → superseded
- DIST-NEW-MAADI · operational_status = operational (EV-299): candidate → superseded
- DIST-SMART-VILLAGE · operational_status = operational (EV-219): candidate → superseded
- DIST-MIT-ELEZZ · operational_status = operational (EV-302): candidate → superseded
- DIST-DAQADOS · operational_status = operational (EV-303): candidate → superseded

### B. إصلاح الأدلة
- **EV-045**: source_url: None → https://www.presidency.eg/ar/المشاريع-القومية/افتتاح-الطريق-الدائري-الأوسطي/؛ title: الدائري الأوسطي – 18 ديسمبر 2020 → افتتاح الطريق الدائري الأوسطي؛ published_date: 2020-12-18 → None
- **EV-046**: source_url: None → https://www.youm7.com/story/2026/8/27/وزارة-النقل-تشغيل-تجريبى-لـ-8-محطات-بمونوريل-غرب-النيل/7527786؛ publisher: الهيئة العامة للاستعلامات (sis.gov.eg) → اليوم السابع؛ title: مونوريل غرب النيل – أغسطس 2026 → وزارة النقل: تشغيل تجريبى لـ 8 محطات بمونوريل غرب النيل؛ source_type: official → news؛ published_date: 2026-08 → 2026-08-27
- **EV-217**: source_url: None → https://www.youm7.com/story/2026/11/9/النشرة-المرورية-كثافات-مرتفعة-بمحاور-القاهرة-والجيزة-وغلق-شارع-الهرم/7611295؛ publisher: Youm7 (حسب باحث Gemini) → اليوم السابع؛ title: Gemini verification: youm7.com, 2026-11-11 → النشرة المرورية: كثافات مرتفعة بمحاور القاهرة والجيزة وغلق شارع الهرم؛ source_type: secondary → news؛ published_date: 2026-11-11 → 2026-11-09
- **EV-228**: source_url: None → https://www.presidency.eg/ar/المشاريع-القومية/مشروع-الدائري-الإقليمي/؛ publisher: Presidency of Egypt (حسب باحث Gemini) → رئاسة الجمهورية؛ title: Gemini verification: presidency.eg, 2018-09-09 → مشروع الدائري الإقليمي؛ source_type: secondary → official؛ published_date: 2018-09-09 → 2018-09-09
- **EV-266**: source_url: None → https://www.youm7.com/story/2025/6/9/جهاز-القاهرة-الجديدة-الانتهاء-من-تنفيذ-وتطوير-حزمة-متكاملة-من/7015510؛ publisher: Youm7 (citing New Cairo City Authority) (حسب باحث Gemini) → اليوم السابع؛ title: Gemini verification: youm7.com, 2025-06-09 → جهاز القاهرة الجديدة: الانتهاء من تنفيذ وتطوير حزمة متكاملة من المحاور؛ source_type: secondary → news؛ published_date: 2025-06-09 → 2025-06-09
- **EV-272**: source_url: None → https://www.youm7.com/story/2025/6/9/جهاز-القاهرة-الجديدة-الانتهاء-من-تنفيذ-وتطوير-حزمة-متكاملة-من/7015510؛ publisher: Youm7 (citing New Cairo City Authority) (حسب باحث Gemini) → اليوم السابع؛ title: Gemini verification: youm7.com, 2024-06-06 → جهاز القاهرة الجديدة: الانتهاء من تنفيذ وتطوير حزمة متكاملة من المحاور؛ source_type: secondary → news؛ published_date: 2024-06-06 → 2025-06-09
- **EV-045:** الصفحة بتقول 156 كم، فهي **بتناقض** الـ155. حقيقة الـ155 (EV-045) فاضلة superseded، واتضافت حقيقة جديدة ROAD-MIDDLE-RING length = 156 مربوطة بـ EV-045 (candidate).
- **EV-228 اتفصل:** دلوقتي بيدعم ROAD-REGIONAL-RING بس. الحقائق التلاتة اللي كانت بتستشهد بيه لوحده (BRIDGE-BENHA-FLYOVER، ROAD-REGIONAL-NW-ARC، ROAD-CAIRO-FAYOUM) اتنقلت لسجلات Gemini جديدة منفصلة من غير رابط (secondary)، وحالتها candidate. حقيقة ROAD-CAIRO-FAYOUM بعد كده اتقلبت superseded بسبب تغيير الحالة.
  - BRIDGE-BENHA-FLYOVER · operational_status = operational: EV-228 → EV-324
  - ROAD-REGIONAL-NW-ARC · operational_status = operational: EV-228 → EV-325
  - ROAD-CAIRO-FAYOUM · operational_status = operational: EV-228 → EV-326
- **EV-217 وEV-266 وEV-272:** بقى ليهم روابط أخبار، فالحقائق اللي كانت معتمدة عليهم لوحدهم (BRIDGE-UNIVERSITY، ROAD-90-NORTH، ROAD-OBOUR-AXIS-NEW-CAIRO) اتنقلت من candidate لـ single_source.
- **تعارض محتاج مراجعة:** EV-272 (2025-06-09) بيقول محور العبور «تم تطويره بالكامل» (operational، single_source)، والكيان لسه under_construction من SIS 2024-05. الـ handoff ماطلبش تغيير، فالحالة ماتغيرتش.

### حقائق جديدة تانية
- TRANSIT-MONORAIL-WEST · trial_operation_plan = 8 محطات تشغيل تجريبي أكتوبر 2026؛ باقي المحطات الربع الأول 2027 (single_source، EV-046)
- TRANSIT-MONORAIL-WEST · public_opening_target = الربع الأول 2027 (corroborated، ['EV-046', 'EV-347'])
- TRANSIT-MONORAIL-WEST · length = 43.8 (single_source، EV-046)
- TRANSIT-MONORAIL-WEST · stations = 13 (single_source، EV-046)
- TRANSIT-MONORAIL-WEST · trains_delivered = 30 (single_source، EV-046)
- ROAD-MIDDLE-RING · length = 156 (candidate، EV-045)
- ROAD-CAIRO-ALEX-DESERT · length = 220 (candidate، EV-328)
- ROAD-MBZ-SOUTH · listed_as_completed_project = True (candidate، EV-328)
- STOP-SADAT · interchange = TRANSIT-METRO-L2 (candidate، EV-329)
- DIST-JURIAN · location = على محور الشيخ زايد (candidate، EV-334)
- DIST-MIT-ELEZZ · location_note = مركز ميت غمر، محافظة الدقهلية — خارج القاهرة الكبرى نفسها (single_source، EV-345)
- DIST-DAQADOS · location_note = مركز ميت غمر، محافظة الدقهلية — خارج القاهرة الكبرى نفسها (single_source، EV-346)
- ROAD-AMR-IBN-ALAS · construction_status = under_construction (candidate، EV-348)
- CITY-MOSTAKBAL · existence_evidence = أعمال تنمية جارية في المدينة (حجر أساس لمشروعات)، والحالة فاضلة unknown (single_source، EV-349)

### أدلة جديدة (26: EV-324…EV-349)
- EV-324 · Presidency of Egypt (حسب باحث Gemini) · secondary · 2018-09-09 · (من غير رابط: سجل Gemini منفصل)
- EV-325 · Presidency of Egypt (حسب باحث Gemini) · secondary · 2018-09-09 · (من غير رابط: سجل Gemini منفصل)
- EV-326 · Presidency of Egypt (حسب باحث Gemini) · secondary · 2018-09-09 · (من غير رابط: سجل Gemini منفصل)
- EV-327 · رئاسة الجمهورية · official · 2022-10-28 · https://www.presidency.eg/ar/قسم-الأخبار/أخبار-رئاسية/الرئيس-عبد-الفتاح-السيسي-يقوم-بجولة-تفقدية-بمدينة-السيارات-المتكاملة-28102022/
- EV-328 · رئاسة الجمهورية / وزارة النقل · official · None · https://www.presidency.eg/media/177204/وزارة-النقل.pdf
- EV-329 · Cairo Governorate · official · None · https://www.cairo.gov.eg/en/governorate-services/transportation-services/metro/
- EV-330 · Cairo Governorate · official · None · https://www.cairo.gov.eg/en/governorate-services/transportation-services/light-electric-train/
- EV-331 · رئاسة مجلس الوزراء · official · 2026-07-30 · https://www.cabinet.gov.eg/Meeting/Details/11900
- EV-332 · اليوم السابع · news · 2022-12-31 · https://m.youm7.com/amp/2022/12/31/تفعيلا-للدور-المجتمعى-طلعت-مصطفى-وسكان-الرحاب-فى-زيارة-لمستشفى/6027976
- EV-333 · اليوم السابع · news · 2026-09-22 · https://m.youm7.com/amp/2026/9/22/كنا-فين-وبقينا-فين-هليوبوليس-الجديدة-من-مدينة-أشباح-لاستثمارات/7554485
- EV-334 · رئاسة مجلس الوزراء · official · 2025-06-01 · https://www.cabinet.gov.eg/News/Details/82402
- EV-335 · محافظة القاهرة · official · 2020 · https://www.cairo.gov.eg/ar/this-month-news/2020/محافظ-القاهرة-يتفقد-ميدان-التحرير/
- EV-336 · محافظة القاهرة (حي مصر القديمة) · official · 2020 · https://www.cairo.gov.eg/ar/governorate-entities/neighborhoods/south-area/hay-misr-alqdema/news/2020/3aa200798cee462eb1058751faecad52
- EV-337 · محافظة القاهرة (حي البساتين) · official · None · https://www.cairo.gov.eg/ar/governorate-entities/neighborhoods/south-area/hay_albasatine/news/2019/6b5a4039060e463a987ce4cd597396cc
- EV-338 · محافظة القاهرة · official · None · https://www.cairo.gov.eg/ar/tourism/tourism-destinations/cultural/museums/
- EV-339 · محافظة القاهرة · official · 2026-06-13 · https://www.cairo.gov.eg/ar/news/2026/june/13/high-turnout-at-the-supreme-council-for-islamic-affairs-exhibition/
- EV-340 · الوطن · news · 2017-08-04 · https://www.elwatannews.com/news/details/2388107
- EV-341 · اليوم السابع · news · 2019-12-05 · https://www.youm7.com/story/2019/12/5/شكوى-من-انقطاع-المياه-عن-منطقة-النرجس-بعمارات-القاهرة-الجديدة/4532764
- EV-342 · محافظة القاهرة (حي المعادي) · official · 2026-08-12 · https://www.cairo.gov.eg/ar/governorate-entities/neighborhoods/south-area/hay-almaadi/news/2026/august/12/upgrading-and-improving-the-efficiency-of-the-lighting-system-and-repairing-faults-on-street-252-degla/
- EV-343 · محافظة القاهرة · official · 2019-07-27 · https://www.cairo.gov.eg/ar/news/2019/bf8531bb77304031bc0450a8904d5313
- EV-344 · محافظة الجيزة · official · None · http://giza.gov.eg/Daleel/Community.and.family/Elsando2-El2gtma3e.aspx
- EV-345 · اليوم السابع · news · 2025-06-21 · https://www.youm7.com/story/2025/6/21/محافظ-الدقهلية-1483-مواطنا-استفادوا-من-القافلة-الطبية-المجانية-بميت/7029426
- EV-346 · اليوم السابع · news · 2026-06-18 · https://www.youm7.com/story/2026/6/18/في-ذكرى-رحيل-إمام-الدعاة-دقادوس-تستقبل-محبي-الشيخ-الشعراوي/7453453
- EV-347 · الوطن · news · 2026-10-18 · https://www.elwatannews.com/news/details/8379396
- EV-348 · محافظة الجيزة · official · 2022-05-28 · http://www.giza.gov.eg/MainPage/DispNewsJ.aspx?ID=3445
- EV-349 · اليوم السابع · news · 2026-02-23 · https://m.youm7.com/amp/2026/2/23/تعزيزًا-لجودة-الحياة-بالمدينة-ميدار-تضع-حجر-الأساس-لـ-٣/7315825

### لسه unknown (17)
- ROAD-REGIONAL-NW-ARC القوس الشمالي الغربي للإقليمي
- ROAD-MBZ-NORTH محمد بن زايد الشمالي
- ROAD-EASTERN-DESERT الصحراوي الشرقي
- ROAD-MOKATTAM-AXIS محور المقطم
- ROAD-WESTERN-DESERT الصحراوي الغربي
- ROAD-CAIRO-ASSIUT-AGRI القاهرة–أسيوط الزراعي
- ROAD-MARYUTEYA المريوطية
- ROAD-DAHSHUR-LINK وصلة دهشور
- ROAD-AMR-IBN-ALAS محور عمرو بن العاص
- BRIDGE-RING-NORTH-WARRAQ كوبري الدائري الشمالي (الوراق)
- BRIDGE-MONIB كوبري المنيب
- TRANSIT-SUPERJET سوبر جيت
- CITY-MOSTAKBAL المستقبل سيتي
- DIST-HADAEK-ASHGAR حدائق الأشجار
- DIST-MANSOURIYA المنصورية
- DIST-GREEN-SARAYA السرايا الخضرا
- PROJ-ADDED-LANDS-REGULARIZATION ملف توفيق أوضاع الأراضي المضافة

السبب: الـ handoff حطهم في قايمة «Do NOT change (no adequate source)»، أو حالتهم فضلت unknown بناءً على التعليمات (ROAD-AMR-IBN-ALAS: حقيقة construction_status بتاريخ 2022-05-28 بس؛ CITY-MOSTAKBAL: دليل على وجود أعمال تنمية بس).
