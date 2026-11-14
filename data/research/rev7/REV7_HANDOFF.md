# rev7 handoff — Greater Cairo Atlas (director-verified, 2026-11-14)

Base: rev6.2 (entities_rev6_2.csv / facts_rev6_2.json / evidence_rev6_2.json in this Drive folder).
Produce: entities_rev7.csv, facts_rev7.json, evidence_rev7.json, CHANGELOG_rev7.md — same schemas as rev6.2.

## Hard rules
- Never delete or retype entities/facts/evidence; never reuse codes. New evidence = EV-305, EV-306, … ; new facts follow your existing fact conventions.
- Status change = new operational_status fact (verification_state single_source or corroborated if 2 sources) + entity status updated; the old status fact becomes superseded (do not delete it).
- `verified` only with an official source that has a URL. News-only → single_source/corroborated.
- Evidence with no publication date on page: published_date null; accessed_date 2026-11-14.
- Use ONLY the URLs below (all opened and checked by me or by Perplexity). Do not add any URL that is not listed here.

## A. Status changes (unknown → new)
| entity | new status | evidence URL | publisher | source_type | published_date | quote |
|---|---|---|---|---|---|---|
| ROAD-AIN-SOKHNA | operational | https://www.presidency.eg/ar/المشاريع-القومية/افتتاح-الطريق-الدائري-الأوسطي/ | رئاسة الجمهورية | official | null | «يتقاطع مع طريق ... (القاهرة / العين السخنة)» |
| ROAD-CAIRO-FAYOUM | operational | (same presidency Middle Ring page) | رئاسة الجمهورية | official | null | «(القاهرة / الفيوم)» |
| ROAD-WAHAT | operational | (same presidency Middle Ring page) | رئاسة الجمهورية | official | null | «(القاهرة / الواحات)» |
| ROAD-MOHAMED-NAGUIB | operational | https://www.presidency.eg/ar/قسم-الأخبار/أخبار-رئاسية/الرئيس-عبد-الفتاح-السيسي-يقوم-بجولة-تفقدية-بمدينة-السيارات-المتكاملة-28102022/ | رئاسة الجمهورية | official | 2022-10-28 | «على تقاطع محور محمد نجيب مع طريق المحاجر» |
| ROAD-MBZ-SOUTH | operational | https://www.presidency.eg/media/177204/وزارة-النقل.pdf | رئاسة الجمهورية / وزارة النقل | official | null | «محور محمد بن زايد الجنوبي (العاصمة الإدارية).» (listed under completed projects) |
| ROAD-CAIRO-ALEX-DESERT | operational | (same presidency MoT PDF) | رئاسة الجمهورية / وزارة النقل | official | null | «طريق القاهرة الإسكندرية الصحراوي بطول 220 كم.» |
| STOP-SADAT | operational | https://www.cairo.gov.eg/en/governorate-services/transportation-services/metro/ | Cairo Governorate | official | null | "Sadat (Tahrir) (interchange station with Line 2)" |
| STOP-DEMERDASH | operational | (same cairo.gov metro page) | Cairo Governorate | official | null | "El Demerdash" |
| STOP-ABBASSIA | operational | (same cairo.gov metro page) | Cairo Governorate | official | null | "Abdo Pasha – Abbassia" |
| STOP-LRT-10TH-RAMADAN-1 | operational | https://www.cairo.gov.eg/en/governorate-services/transportation-services/light-electric-train/ | Cairo Governorate | official | null | "10th of Ramadan (1)" |
| CITY-MADINATY | operational | https://www.cabinet.gov.eg/Meeting/Details/11900 | رئاسة مجلس الوزراء | official | 2026-07-30 | «تحت اسم The Spine داخل مشروع "مدينتي" بالقاهرة الجديدة» |
| CITY-REHAB | operational | https://m.youm7.com/amp/2022/12/31/تفعيلا-للدور-المجتمعى-طلعت-مصطفى-وسكان-الرحاب-فى-زيارة-لمستشفى/6027976 | اليوم السابع | news | 2022-12-31 | «نحو 150 من سكان مدينة الرحاب» |
| CITY-NEW-HELIOPOLIS | partial | https://m.youm7.com/amp/2026/9/22/كنا-فين-وبقينا-فين-هليوبوليس-الجديدة-من-مدينة-أشباح-لاستثمارات/7554485 | اليوم السابع | news | 2026-09-22 | «تحولت هليوبوليس الجديدة من مدينة أشباح وطاردة للسكان…» |
| DIST-JURIAN | under_construction | https://www.cabinet.gov.eg/News/Details/82402 | رئاسة مجلس الوزراء | official | 2025-06-01 | «مراسم إطلاق مدينة "جريان" الواقعة على محور الشيخ زايد» |
| DIST-TAHRIR | operational | https://www.cairo.gov.eg/ar/this-month-news/2020/محافظ-القاهرة-يتفقد-ميدان-التحرير/ | محافظة القاهرة | official | 2020 (year precision) | «ميدان التحرير أعمال تطوير» |
| DIST-MANIAL | operational | https://www.cairo.gov.eg/ar/governorate-entities/neighborhoods/south-area/hay-misr-alqdema/news/2020/3aa200798cee462eb1058751faecad52 | محافظة القاهرة (حي مصر القديمة) | official | 2020 | «حملة لرفع مستوى النظافة بشارعي المنيل ومحمد الصغير» |
| DIST-MERAJ | operational | https://www.cairo.gov.eg/ar/governorate-entities/neighborhoods/south-area/hay_albasatine/news/2019/6b5a4039060e463a987ce4cd597396cc | محافظة القاهرة (حي البساتين) | official | null | «كورنيش المعراج العلوي» |
| DIST-DOWNTOWN | operational | https://www.cairo.gov.eg/ar/tourism/tourism-destinations/cultural/museums/ | محافظة القاهرة | official | null | «شارع محمد فريد في منطقة وسط البلد» |
| DIST-FUSTAT | operational | (same cairo.gov museums page) | محافظة القاهرة | official | null | «في قلب مدينة الفسطاط التاريخية بمنطقة مصر القديمة» |
| DIST-HUSSEIN-AZHAR | operational | https://www.cairo.gov.eg/ar/news/2026/june/13/high-turnout-at-the-supreme-council-for-islamic-affairs-exhibition/ | محافظة القاهرة | official | 2026-06-13 | «بمسجد الإمام الحسين (رضي الله عنه) … إقبالاً جماهيريًّا كثيفًا» |
| DIST-OM-BAYOUMI | operational | https://www.elwatannews.com/news/details/2388107 | الوطن | news | 2017-08-04 | «"أم بيومي" أحد أشهر المناطق الشعبية … بشبرا الخيمة» |
| DIST-NARGES | operational | https://www.youm7.com/story/2019/12/5/شكوى-من-انقطاع-المياه-عن-منطقة-النرجس-بعمارات-القاهرة-الجديدة/4532764 | اليوم السابع | news | 2019-12-05 | «بمنطقة النرجس عمارات القاهرة الجديدة بالتجمع الخامس» |
| DIST-DEGLA | operational | https://www.cairo.gov.eg/ar/governorate-entities/neighborhoods/south-area/hay-almaadi/news/2026/august/12/upgrading-and-improving-the-efficiency-of-the-lighting-system-and-repairing-faults-on-street-252-degla/ | محافظة القاهرة (حي المعادي) | official | 2026-08-12 | «إصلاح الأعطال بشارع 252 دجلة» |
| DIST-ZAHRAA-MAADI | operational | https://www.cairo.gov.eg/ar/news/2019/bf8531bb77304031bc0450a8904d5313 | محافظة القاهرة | official | 2019-07-27 | «بمناطق الشطر العاشر بزهراء المعادى» |
| DIST-NEW-MAADI | operational | (same cairo.gov 2019 page) | محافظة القاهرة | official | 2019-07-27 | «شارع 500 بالمعادى الجديدة» |
| DIST-SMART-VILLAGE | operational | http://giza.gov.eg/Daleel/Community.and.family/Elsando2-El2gtma3e.aspx | محافظة الجيزة | official | null | «فرع القريه الذكيه» |
| DIST-MIT-ELEZZ | operational | https://www.youm7.com/story/2025/6/21/محافظ-الدقهلية-1483-مواطنا-استفادوا-من-القافلة-الطبية-المجانية-بميت/7029426 | اليوم السابع | news | 2025-06-21 | «بقرية ميت العز مركز ميت غمر» — add note: Mit Ghamr, Dakahlia (outside Greater Cairo proper) |
| DIST-DAQADOS | operational | https://www.youm7.com/story/2026/6/18/في-ذكرى-رحيل-إمام-الدعاة-دقادوس-تستقبل-محبي-الشيخ-الشعراوي/7453453 | اليوم السابع | news | 2026-06-18 | «قرية دقادوس التابعة لمركز ميت غمر بمحافظة الدقهلية» — same note |
| TRANSIT-MONORAIL-WEST | under_construction (was planned) | https://www.youm7.com/story/2026/8/27/وزارة-النقل-تشغيل-تجريبى-لـ-8-محطات-بمونوريل-غرب-النيل/7527786 + https://www.elwatannews.com/news/details/8379396 | اليوم السابع; الوطن | news | 2026-08-27; 2026-10-18 | «بدء التشغيل التجريبي … لـ 8 محطات … خلال شهر أكتوبر 2026 … باقي المحطات … الربع الأول من عام 2027» ; «بدء تشغيل مونوريل غرب النيل لجمهور الركاب في الربع الأول من العام المقبل» — corroborated; also facts: length 43.8 km, 13 stations, 30 trains delivered (youm7). Stations of this line stay planned/under_construction as they are; no operational claim. |

Do NOT change (no adequate source): DIST-MANSOURIYA (page only mentions the road), CITY-MOSTAKBAL (development only), DIST-HADAEK-ASHGAR (station name only), DIST-GREEN-SARAYA, PROJ-ADDED-LANDS-REGULARIZATION, ROAD-REGIONAL-NW-ARC, ROAD-MBZ-NORTH, ROAD-EASTERN-DESERT, ROAD-MOKATTAM-AXIS, ROAD-WESTERN-DESERT, ROAD-CAIRO-ASSIUT-AGRI, ROAD-MARYUTEYA, ROAD-DAHSHUR-LINK, BRIDGE-RING-NORTH-WARRAQ, BRIDGE-MONIB, TRANSIT-SUPERJET. Optional dated (non-status) fact: ROAD-AMR-IBN-ALAS construction_status=under_construction valid_as_of 2022-05-28 from http://www.giza.gov.eg/MainPage/DispNewsJ.aspx?ID=3445 «محور عمرو بن العاص شريان مروري جديد … الجارى تنفيذه» — keep entity status unknown.
Optional for CITY-MOSTAKBAL: add existence evidence https://m.youm7.com/amp/2026/2/23/تعزيزًا-لجودة-الحياة-بالمدينة-ميدار-تضع-حجر-الأساس-لـ-٣/7315825 (youm7 2026-02-23) but keep status unknown.

## B. Evidence repairs (existing codes: add url, fix type/date)
- EV-045 → url https://www.presidency.eg/ar/المشاريع-القومية/افتتاح-الطريق-الدائري-الأوسطي/ ; note: page says «بطول ١٥٦ كم» → it CONTRADICTS 155 km. Link it to the ROAD-MIDDLE-RING length=156 fact; the 155 km fact stays superseded.
- EV-046 → url = the youm7 2026-08-27 monorail page above; source_type news; publisher اليوم السابع; published_date 2026-08-27 (SIS page never found).
- EV-217 → https://www.youm7.com/story/2026/11/9/النشرة-المرورية-كثافات-مرتفعة-بمحاور-القاهرة-والجيزة-وغلق-شارع-الهرم/7611295 (youm7, news, 2026-11-09) «تباطؤ الحركة أعلى كوبري الجامعة وكوبري عباس»
- EV-228 → https://www.presidency.eg/ar/المشاريع-القومية/مشروع-الدائري-الإقليمي/ (official, 2018-09-09) «بهذا يكون الطريق الدائري الإقليمي قد اكتمل بطول ٤٠٠ كم» — supports ROAD-REGIONAL-RING only; detach it from BRIDGE-BENHA-FLYOVER / ROAD-REGIONAL-NW-ARC / ROAD-CAIRO-FAYOUM facts (those keep other evidence or fall back to candidate).
- EV-266 and EV-272 → https://www.youm7.com/story/2025/6/9/جهاز-القاهرة-الجديدة-الانتهاء-من-تنفيذ-وتطوير-حزمة-متكاملة-من/7015510 (youm7, news, 2025-06-09); EV-266 quote «محور السادات … يمتد من التسعين الشمالي وحتى الطريق الدائري»; EV-272 quote «محور العبور … وتم تطويره بالكامل».
- All other domain-only "Gemini verification" evidence stays secondary with no url (unchanged).

## C. Expected output
CHANGELOG_rev7.md listing every change with code, old → new, and evidence code. Report final counts (entities stay 342; unknown statuses should drop from 45 to about 16).
