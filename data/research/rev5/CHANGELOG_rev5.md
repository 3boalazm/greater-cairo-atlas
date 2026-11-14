# Greater Cairo Atlas — Seed revision 5 · CHANGELOG

## rev5 — 2026-11-14 (دمج تقرير الشمال + حسم الحالات + روابط EV-042/045/046 + أسماء OSM)

Baseline: rev4 (275 entities، 602 facts، 137 evidence). مفيش كود كيان اتمسح ولا اتغير اسمه، ومفيش حقيقة اتمسحت ولا قيمتها اتعدلت. كل تعديل على سجل قديم إما تغيير `verification_state`، أو `status` للكيان، أو إضافة aliases، أو إضافة ملاحظة في `note` للدليل (EV-042/045/046). مفيش إحداثيات اتضافت. نفس الأعمدة والصيغ بتاعة rev4 بالظبط.

المدخلات: تقرير «Greater Cairo North Sector Atlas» (doc 1RKbtNma…) من Drive، وملفات rev4، وبحث ويب جديد. التقرير الشرقي والغربي اتدمجوا قبل كده في rev4.

### الإجماليات
| | rev4 | rev5 |
|---|---|---|
| Entities | 275 | **342** (+67) |
| Facts | 602 | **1108** (+506) |
| Evidence | 137 | **198** (+61: official 40 · news 16 · secondary 5) |
| Entity status `unknown` | 151 | **104** (103 من الكيانات القديمة + 1 جديد) |

حالة الكيانات: operational 196 · unknown 104 · under_construction 34 · planned 6 · partial 1 · approved_planned 1.

حالات الحقائق (كلها 1108): candidate 611 · verified 294 · disputed 78 · single_source 77 · corroborated 26 · superseded 14 · rejected 8.

### القواعد
- **verified**: الحقيقة بتستشهد بدليل رسمي ليه رابط، **و** أنا شفت محتوى الصفحة بنفسي (جلب مباشر أو نص الصفحة في نتايج البحث). في rev5 ده بينطبق على صفحات بوابة محافظة القاهرة (قائمة الـ38 حي، صفحات الأحياء، ملف المساحات، صفحة المونوريل، صفحة كوبري قصر النيل)، وخبر المحافظة عن أحياء الشمال (من تقرير الشمال)، وصفحة هضبة الجيزة على egymonuments.gov.eg. السكريبت بيتأكد إن مفيش حقيقة verified من غير دليل رسمي برابط.
- **candidate**: رابط رسمي مقدرتش أفتحه. qaliobia.gov.eg وnewcities.gov.eg وgiza.gov.eg بيمنعوا الجلب الآلي، وأغلب صفحات presidency.eg وnat.gov.eg بترجع خطأ. المحتوى في الحالة دي منقول من التقرير.
- **single_source**: خبر أو مصدر ثانوي واحد. **corroborated**: خبرين مستقلين أو أكتر متفقين. المصادر الثانوية عمرها ما بتخلي حقيقة verified لوحدها.
- **حالة الكيان**: بتتحدد من حقيقة `operational_status` بتستشهد بدليل رسمي برابط، زي rev4. **إضافة في rev5 (محتاجة مراجعة):** بقيت أسمح كمان بالحالة من حقيقة **corroborated** (خبرين مستقلين). ده اتطبق بس على 10 محطات BRT في المرحلة التانية (مصراوي 26/9/2026 + Egypt Independent). لو مش موافق، ارجّع حالة الست محطات القديمة (AIN-SOKHNA-RD، MAADI، MOKATTAM، OMRANIYA، TALBIYA، MARYUTEYA) لـ unknown، والأربعة الجداد كمان.
- **planned عمره ما بيتعرض كـ operational**: زهراء المعادي والأوتوستراد فضلوا planned، والمنصورية اتسجلت كتعارض (C27b) لأن مصراوي بيقول إنها لسه مش شغالة.
- التعارضات بتتسجل جنب بعض، والحقيقة القديمة بتتغير لـ disputed أو superseded بس، عمرها ما بتتمسح.

### روابط EV-042 / EV-045 / EV-046 (المهمة 3)
مالقيتش الصفحة الرسمية المطلوبة لأي واحد فيهم، فالـ `source_url` فاضل `null` (ماخمّنتش أي رابط). اللي اتعمل إني ضفت ملاحظة على كل واحد بتشير لأقرب مصدر حقيقي:
- **EV-042**: دورت على cabinet.gov.eg ومالقيتش صفحة للبيان. أقرب نسخة: ماسبيرو 13 سبتمبر 2026 (EV-182) وبانكر (EV-183): المرحلة التانية العين السخنة→زويل، 40 كم، 15 محطة، إجمالي 31. الـ source_url فاضل null
- **EV-045**: صفحة presidency.eg بتاريخ 18 ديسمبر 2020 مالقيتهاش. نفس بيان المتحدث الرسمي (155 كم) موجود على بوابة محافظة القاهرة (EV-180) وفي الأهرام أونلاين (EV-181). الـ source_url فاضل null
- **EV-046**: دورت على sis.gov.eg ومالقيتش صفحة من أغسطس 2026 فيها «بدءاً من 2027». نفس المعلومة رسمياً في EV-053 (الرئاسة 2 أغسطس 2026). صفحة المونوريل على بوابة محافظة القاهرة (EV-188) مفيهاش تاريخ. خطة التشغيل التجريبي في EV-189 وEV-190. الـ source_url فاضل null

### تغييرات حالة الكيانات: 48
- 48 كيان قديم اتحسمت حالته من unknown. 67 كيان جديد ليه حالة من أول ما اتضاف (مش محسوبين هنا).

<details><summary>كل التغييرات</summary>

- DIST-HELIOPOLIS: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-NOZHA: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-NASR-CITY: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-AIN-SHAMS: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-MATARIYA: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-MARG: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-BULAQ: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-ABDEEN: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-SHUBRA: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-ZAWYA-HAMRA: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-HADAYEK-QOBBA: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-ROD-ELFARAG: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-SAHEL: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-OLD-CAIRO: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-MOKATTAM: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-SAYEDA-ZEINAB: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-TEBBIN: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-HELWAN: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-MAADI: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- CITY-15-MAY: unknown → operational (EV-173) — حي رسمي في قائمة أحياء محافظة القاهرة
- DIST-ZAMALEK: unknown → operational (EV-174) — صفحة حي الزمالك على بوابة محافظة القاهرة
- DIST-ABBASSIA: unknown → operational (EV-176) — صفحة حي العباسية على بوابة محافظة القاهرة
- CITY-CAIRO: unknown → operational (EV-173) — مدينة القاهرة = محافظة القاهرة (38 حي)
- CITY-GIZA: unknown → operational (EV-097) — أحياء مدينة الجيزة في قائمة أحياء المحافظة (EV-097)
- CITY-SHUBRA-ELKHEIMA: unknown → operational (EV-137) — التقسيم الإداري الرسمي للقليوبية (يناير 2025)
- CITY-QALYUB: unknown → operational (EV-137) — التقسيم الإداري الرسمي للقليوبية (يناير 2025)
- CITY-KHANKA: unknown → operational (EV-137) — التقسيم الإداري الرسمي للقليوبية (يناير 2025)
- CITY-QANATER: unknown → operational (EV-137) — التقسيم الإداري الرسمي للقليوبية (يناير 2025)
- CITY-BENHA: unknown → operational (EV-137) — التقسيم الإداري الرسمي للقليوبية (يناير 2025)
- DIST-KHOSOUS: unknown → operational (EV-137) — التقسيم الإداري الرسمي للقليوبية (يناير 2025)
- DIST-BAHTIM: unknown → operational (EV-137) — التقسيم الإداري الرسمي للقليوبية (يناير 2025)
- DIST-ABU-ZAABAL: unknown → operational (EV-137) — التقسيم الإداري الرسمي للقليوبية (يناير 2025)
- AUTH-OBOUR-AGENCY: unknown → operational (EV-062) — صفحة NUCA للعبور (جهاز تنمية مدينة العبور)
- CITY-NEW-OBOUR: unknown → under_construction (EV-065) — قرار NUCA 142 (2020) بتقنين الأراضي وإعداد المخططات التفصيلية
- AUTH-NEW-OBOUR-AGENCY: unknown → operational (EV-065) — الجهاز مذكور كجهة الولاية في قرار NUCA 142
- STOP-KIT-KAT: unknown → operational (EV-039, EV-195) — محطة على الخط الثالث (الجزء أ من المرحلة 3، تشغيل تجريبي 2022) والخط شغال بالكامل
- STOP-BRT-AIN-SOKHNA-RD: unknown → operational (EV-052, EV-184) — تشغيل المرحلة التانية للجمهور 26/9/2026 (خبرين مستقلين، corroborated)
- STOP-BRT-MAADI: unknown → operational (EV-052, EV-184) — تشغيل المرحلة التانية للجمهور 26/9/2026 (خبرين مستقلين، corroborated)
- STOP-BRT-MOKATTAM: unknown → operational (EV-052, EV-184) — تشغيل المرحلة التانية للجمهور 26/9/2026 (خبرين مستقلين، corroborated)
- STOP-BRT-OMRANIYA: unknown → operational (EV-052, EV-184) — تشغيل المرحلة التانية للجمهور 26/9/2026 (خبرين مستقلين، corroborated)
- STOP-BRT-TALBIYA: unknown → operational (EV-052, EV-184) — تشغيل المرحلة التانية للجمهور 26/9/2026 (خبرين مستقلين، corroborated)
- STOP-BRT-MARYUTEYA: unknown → operational (EV-052, EV-184) — تشغيل المرحلة التانية للجمهور 26/9/2026 (خبرين مستقلين، corroborated)
- STOP-MONORAIL-MOSHIR-TANTAWY: unknown → operational (EV-050) — الخط كامل شغال (22 محطة) من 27/6/2026 والمحطة بداية المرحلة الأولى
- ROAD-SHUBRA-BENHA-FREE: unknown → operational (EV-151) — صفحة مشروع الرئاسة: افتتاح يناير 2018
- ROAD-CAIRO-ALEX-AGRI: unknown → operational (EV-138) — قاعدة بيانات النقل الموحدة (GOPP) لقطاع القليوبية
- BRIDGE-QASR-EL-NIL: unknown → operational (EV-191) — صفحة الكوبري على بوابة محافظة القاهرة (شريان قلب العاصمة)
- ROAD-ASSAR-AXIS: unknown → operational (EV-155) — صفحة مشروع الرئاسة: افتتاح 29 يونيو 2020
- LANDMARK-PYRAMIDS: unknown → operational (EV-192) — صفحة الموقع الأثري الرسمية (وزارة السياحة والآثار)

</details>

### الكيانات الجديدة (67)
- **من تقرير الشمال**: محافظة القليوبية، حيين شبرا الخيمة، مسطرد، شبين القناطر/طوخ/قها/كفر شكر، السلام أول وثان، كباري (بنها على النيل، قليوب العلوي، تقاطع تحيا مصر مع الدائري، كباري شبرا)، محاور (إبراهيم العرابي، عدلي منصور، مسطرد)، امتدادا الخط الأول والتاني، تطوير الخط الأول، 7 محطات مترو، 13 محطة BRT للمرحلة الأولى، أهالينا 1، منطقة الشروق الصناعية، وزارة النقل، GOPP.
- **من بحث rev5**: محافظة القاهرة + 15 حي رسمي ناقصين من قائمة الـ38 حي (منشأة ناصر، الوايلي، وسط، غرب، الأزبكية، الموسكي، باب الشعرية، الشرابية، الزيتون، الأميرية، الخليفة، البساتين، دار السلام، المعصرة، طره)، ومحطتين BRT اتضافوا للمرحلة الأولى (المشير طنطاوي، الجولف)، و4 محطات في المرحلة التانية (الجزائر، الإمامين، الزهراء، البحر الأعظم)، ومحور العبور في القاهرة الجديدة (عشان اسم OSM «محور العبور»).

<details><summary>القائمة</summary>

- AUTH-QALYUBIA-GOVERNORATE (authority، NORTH، operational) محافظة القليوبية
- AUTH-CAIRO-GOVERNORATE (authority، CENTRAL، operational) محافظة القاهرة
- DIST-WEST-SHUBRA-ELKHEIMA (district، NORTH، operational) حي غرب شبرا الخيمة
- DIST-EAST-SHUBRA-ELKHEIMA (district، NORTH، operational) حي شرق شبرا الخيمة
- DIST-MOSTOROD (district، NORTH، operational) مسطرد
- CITY-SHIBIN-ELQANATER (city، NORTH، operational) شبين القناطر
- CITY-TOUKH (city، NORTH، operational) طوخ
- CITY-QAHA (city، NORTH، operational) قها
- CITY-KAFR-SHUKR (city، NORTH، operational) كفر شكر
- DIST-SALAM-1 (district، EAST، operational) حي السلام أول
- DIST-SALAM-2 (district، EAST، operational) حي السلام ثان
- DIST-MANSHIYAT-NASSER (district، CENTRAL، operational) حي منشأة ناصر
- DIST-WAILY (district، CENTRAL، operational) حي الوايلي
- DIST-WASAT (district، CENTRAL، operational) حي وسط
- DIST-GHARB (district، CENTRAL، operational) حي غرب
- DIST-AZBAKEYA (district، CENTRAL، operational) حي الأزبكية
- DIST-MOUSKY (district، CENTRAL، operational) حي الموسكي
- DIST-BAB-SHAREYA (district، CENTRAL، operational) حي باب الشعرية
- DIST-SHARABIYA (district، NORTH، operational) حي الشرابية
- DIST-ZEITOUN (district، NORTH، operational) حي الزيتون
- DIST-AMIRIYA (district، NORTH، operational) حي الأميرية
- DIST-KHALIFA (district، SOUTH، operational) حي الخليفة
- DIST-BASATIN (district، SOUTH، operational) حي البساتين
- DIST-DAR-ELSALAM (district، SOUTH، operational) حي دار السلام
- DIST-MAASARA (district، SOUTH، operational) حي المعصرة
- DIST-TORA (district، SOUTH، operational) حي طره
- BRIDGE-BENHA-NILE (bridge، NORTH، operational) كوبري بنها على النيل
- BRIDGE-QALYUB-FLYOVER (bridge، NORTH، operational) كوبري قليوب العلوي
- BRIDGE-TAHYA-MISR-RING (bridge، NORTH، operational) كوبري تقاطع محور تحيا مصر مع الطريق الدائري
- BRIDGE-SHUBRA-AXIS (bridge، NORTH، operational) كباري منطقة شبرا (محور روض الفرج)
- ROAD-IBRAHIM-ORABI-AXIS (road، NORTH، operational) محور الفريق إبراهيم العرابي
- ROAD-ADLY-MANSOUR-AXIS (road، NORTH، operational) محور المستشار عدلي منصور
- ROAD-MOSTOROD-AXIS (road، NORTH، operational) محور مسطرد
- ROAD-OBOUR-AXIS-NEW-CAIRO (road، EAST، unknown) محور العبور (القاهرة الجديدة)
- TRANSIT-METRO-L1-EXT (transit_line، NORTH، planned) امتداد الخط الأول لشبين القناطر
- TRANSIT-METRO-L2-EXT (transit_line، NORTH، planned) امتداد الخط الثاني للطريق الدائري
- PROJ-METRO-L1-UPGRADE (project، CENTRAL، under_construction) تطوير الخط الأول للمترو
- STOP-M1-EL-MARG (transit_stop، NORTH، operational) المرج (الخط الأول)
- STOP-M1-NEW-EL-MARG (transit_stop، NORTH، operational) المرج الجديدة
- STOP-M2-SHUBRA-ELKHEIMA (transit_stop، NORTH، operational) شبرا الخيمة (الخط الثاني)
- STOP-M2-KHALAFAWY (transit_stop، NORTH، operational) الخلفاوي
- STOP-M2-ST-TERESA (transit_stop، NORTH، operational) سانت تريزا
- STOP-M3-ROD-ELFARAG-AXIS (transit_stop، NORTH، operational) محور روض الفرج (الخط الثالث)
- STOP-M3-RING-ROAD (transit_stop، NORTH، operational) الطريق الدائري (الخط الثالث)
- PROJ-AHALINA-1 (project، EAST، operational) مشروع الإسكان الاجتماعي «أهالينا 1»
- PROJ-SHOROUK-INDUSTRIAL-ABU-ZAABAL (project، NORTH، operational) منطقة الشروق الصناعية بأبو زعبل
- AUTH-MOT (authority، REGIONAL، operational) وزارة النقل
- AUTH-GOPP (authority، REGIONAL، operational) الهيئة العامة للتخطيط العمراني
- STOP-BRT-ALEX-AGRI (transit_stop، NORTH، operational) محطة الإسكندرية الزراعي (BRT)
- STOP-BRT-SHARQAWIYA (transit_stop، NORTH، operational) محطة العقيد أحمد عبد الرحيم (الشرقاوية)
- STOP-BRT-SHUBRA-BENHA (transit_stop، NORTH، operational) محطة شبرا بنها (BRT)
- STOP-BRT-BAHTIM (transit_stop، NORTH، operational) محطة بهتيم (BRT)
- STOP-BRT-MOSTOROD (transit_stop، NORTH، operational) محطة مسطرد (BRT)
- STOP-BRT-KHOSOUS (transit_stop، NORTH، operational) محطة الخصوص (BRT)
- STOP-BRT-EL-MARG (transit_stop، NORTH، operational) محطة المرج (BRT)
- STOP-BRT-QALG (transit_stop، NORTH، operational) محطة القلج (BRT)
- STOP-BRT-ZAKAT (transit_stop، NORTH، operational) محطة مؤسسة الزكاة (BRT)
- STOP-BRT-IBRAHIM-ORABI (transit_stop، NORTH، operational) محطة الفريق إبراهيم عرابي (BRT)
- STOP-BRT-SALAM (transit_stop، NORTH، operational) محطة السلام (BRT)
- STOP-BRT-SUEZ-RD (transit_stop، EAST، operational) محطة طريق السويس (BRT)
- STOP-BRT-POLICE-ACADEMY (transit_stop، EAST، operational) محطة أكاديمية الشرطة (BRT)
- STOP-BRT-MOSHIR-TANTAWY (transit_stop، EAST، operational) محطة المشير طنطاوي (BRT)
- STOP-BRT-GOLF (transit_stop، EAST، operational) محطة الجولف (BRT)
- STOP-BRT-ALGERIA-ST (transit_stop، SOUTH، operational) محطة الجزائر (BRT)
- STOP-BRT-IMAMAIN (transit_stop، SOUTH، operational) محطة الإمامين (BRT)
- STOP-BRT-ZAHRAA (transit_stop، SOUTH، operational) محطة الزهراء (BRT)
- STOP-BRT-BAHR-AZAM (transit_stop، WEST، operational) محطة البحر الأعظم (BRT)

</details>

### Aliases (المهمة 4)
- الطلبات المحددة: ROAD-RING-ROAD (+الطريق الدائري، The Ring Road)، TRANSIT-METRO-L3 (+Line 3، Line 3 Extension)، TRANSIT-METRO-L2 (+El-Mounib - Shubra El-Kheima)، TRANSIT-METRO-L1 (+خط حلوان المرج، Helwan-ElMarg Railway).
- **طريق شبرا بنها الحر** = ROAD-SHUBRA-BENHA-FREE، فاتضاف كـ alias. **محور الشيخ محمد بن زايد الشمالى / الجنوبي** = ROAD-MBZ-NORTH / ROAD-MBZ-SOUTH، فاتضافوا كـ aliases (بالهجاء «الشمالى» زي OSM، والهجاء «الشمالي» كمان). **محور العبور** مش هو مدينة العبور ولا أي طريق موجود: ده محور في القاهرة الجديدة بيربط التسعين الجنوبي بطريق السخنة القديم، فاتعمل كيان جديد ROAD-OBOUR-AXIS-NEW-CAIRO بمصادره.
- **كل كيانات المدن والأحياء (القديمة والجديدة)** اتضافلها الاسم الرسمي بالعربي (حي/قسم/مركز ومدينة …) وهجاءات إنجليزي شائعة زي اللي في OSM. السكريبت بيتأكد إن مفيش مدينة ولا حي قديم من غير أسماء OSM. إجمالي الكيانات اللي اتعدلت aliases بتاعتها: 114.
- ملحوظة: الأسماء الإنجليزي دي هجاءات شائعة للمطابقة مع OSM، مش اقتباس من صفحة رسمية. لو ظهر اسم مختلف في الحدود الفعلية في OSM، ضيفه.

### التعارضات الجديدة (جنب بعض)
**C29 طول الخط الأول**
- TRANSIT-METRO-L1 · length = 44 (EV-140)
- TRANSIT-METRO-L1 · length = 44.3 (EV-138)

**C30 طول ومحطات الخط الثالث (GOPP 2022 قبل اكتمال الخط)**
- TRANSIT-METRO-L3 · total_length = 41.2 (EV-039)
- TRANSIT-METRO-L3 · total_length = 47.87 (EV-138)

**C16b إجمالي طول ومحطات LRT**
- TRANSIT-LRT · planned_length_all_branches = 90 (EV-145)
- TRANSIT-LRT · planned_length_all_branches = 103 (EV-077)
- TRANSIT-LRT · planned_length_all_branches = 105 (EV-013)

**C31 محطات المرحلة الرابعة LRT**
- TRANSIT-LRT · phase4_extension_stations = 3 (EV-074)
- TRANSIT-LRT · phase4_extension_stations = 5 (EV-051)

**C32 طول ومحطات الخط السادس**
- TRANSIT-METRO-L6 · length_approx = 38 (EV-029)
- TRANSIT-METRO-L6 · length_approx = 30 (EV-138)
- TRANSIT-METRO-L6 · stations = 26 (EV-029)
- TRANSIT-METRO-L6 · stations = 12 (EV-138)

**C33 عدد محطات المرحلة التانية BRT**
- TRANSIT-BRT · phase2_stations = 16 (EV-043)
- TRANSIT-BRT · phase2_stations = 15 (EV-182)
- TRANSIT-BRT · phase2_stations = 14 (EV-052)
- TRANSIT-BRT · phase2_stations = 21 (EV-187)

**C34 إجمالي محطات BRT المخطط**
- TRANSIT-BRT · planned_total_stations = 48 (EV-147)
- TRANSIT-BRT · planned_total_stations = 57 (EV-148)

**C35 محطات المرحلة التالتة BRT**
- TRANSIT-BRT · phase3_stations = 16 (EV-149)
- TRANSIT-BRT · phase3_stations = 13 (EV-150)

**C27b حالة محطة BRT المنصورية**
- STOP-BRT-MANSOURIYA · operational_status = operational (EV-121)
- STOP-BRT-MANSOURIYA · operational_status = planned (EV-052)

**C36 حالة طريق شرق الرياح التوفيقي (الحالة على الكيان فضلت under_construction)**
- ROAD-EAST-RAYAH-TAWFIKI · operational_status = under_construction (EV-010)
- ROAD-EAST-RAYAH-TAWFIKI · operational_status = partial (EV-152)

**C37 طول الدائري الإقليمي**
- ROAD-REGIONAL-RING · total_length = 400 (EV-091)
- ROAD-REGIONAL-RING · total_length = 369 (EV-138)

**C38 تعويضات محور مسطرد**
- ROAD-MOSTOROD-AXIS · compensation_paid = 115 (EV-162)
- ROAD-MOSTOROD-AXIS · compensation_paid = 180 (EV-163)

### سجلات قديمة اتغيرت حالتها (7)
- TRANSIT-LRT · planned_stations = 19: candidate → disputed (C16b: صفحة حجر الأساس بالرئاسة بتقول 16 محطة)
- TRANSIT-LRT · phase4_extension_stations = 5: candidate → disputed (C31: NAT (صفحة المرحلة 3 و4) بتقول 3 محطات للمرحلة الرابعة)
- TRANSIT-METRO-L6 · length_approx = 38: candidate → disputed (C32: GOPP (2022) بيقول 30 كم)
- TRANSIT-METRO-L6 · stations = 26: candidate → disputed (C32: GOPP (2022) بيقول 12 محطة)
- TRANSIT-BRT · phase2_stations = 16: verified → disputed (C33: تعريف المرحلة التانية بيختلف: 16 (المشير طنطاوي→صن كابيتال، الرئاسة)، 15 (العين السخنة→زويل، مجلس الوزراء 13/9)، 14 (العين السخنة→صن كابيتال، مصراوي 26/9))
- ROAD-EAST-RAYAH-TAWFIKI · operational_status = under_construction: candidate → disputed (C36: SIS بتقول المرحلة الأولى (بنها–هلا 17 كم) خلصت والتانية شغالة)
- ROAD-REGIONAL-RING · total_length = 400: candidate → disputed (C37: GOPP/تقرير الشمال بيقول 369 كم)

### لسه unknown (104 كيان) والسبب
**district (29)** — منطقة/حي سكني مش حي إداري رسمي في قائمة أحياء القاهرة أو الجيزة أو القليوبية، ومالقيتش صفحة رسمية بتذكره بالاسم
- DIST-DOWNTOWN وسط البلد
- DIST-TAHRIR التحرير
- DIST-GARDEN-CITY جاردن سيتي
- DIST-HUSSEIN-AZHAR الحسين والأزهر
- DIST-FUSTAT الفسطاط
- DIST-MANIAL المنيل
- DIST-OM-BAYOUMI أم بيومي
- DIST-NARGES النرجس
- DIST-CAPITAL-GARDENS حدائق العاصمة
- DIST-DEGLA دجلة
- DIST-ZAHRAA-MAADI زهراء المعادي
- DIST-MERAJ المعراج
- DIST-KATAMEYA القطامية
- DIST-NEW-MAADI المعادي الجديدة
- DIST-MOHANDESSIN المهندسين
- DIST-FAISAL فيصل
- DIST-REMAYA الرماية
- DIST-HADAYEK-AHRAM حدائق الأهرام
- DIST-HADAEK-OCTOBER حدائق أكتوبر — الجهاز اتأسس (EV-130) والمساحة معروفة، بس مفيش مصدر بيحدد مرحلة التنمية
- DIST-HADAEK-ASHGAR حدائق الأشجار
- DIST-SMART-VILLAGE القرية الذكية
- DIST-ABU-RAWASH أبو رواش
- DIST-SAFT-ELLABAN صفط اللبن
- DIST-MANSOURIYA المنصورية
- DIST-MANSHEYET-BAKARY منشأة البكاري
- DIST-JURIAN جريان
- DIST-GREEN-SARAYA السرايا الخضرا
- DIST-MIT-ELEZZ ميت العز
- DIST-DAQADOS دقادوس

**road (30)** — طريق/محور موجود فعلاً، بس ماشفتش صفحة رسمية فيها حالته في الجولة دي (أغلب صفحات presidency.eg وnat.gov.eg بتمنع الجلب، والبحث مارجعش صفحة رسمية)
- ROAD-REGIONAL-RING الإقليمي — C9: الرئاسة (partial) ضد SIS (operational)، والتعارض لسه قائم
- ROAD-BENHA-MANSOURA بنها–المنصورة
- ROAD-REGIONAL-NW-ARC القوس الشمالي الغربي للإقليمي
- ROAD-DABAA-AXIS محور الضبعة
- ROAD-MARG-AXIS محور المرج — فيه محطة BRT شغالة عند تقاطعه، بس دي مش دليل على حالة المحور نفسه
- ROAD-ISMAILIA-AGRI الإسماعيلية الزراعي
- ROAD-BILBEIS-DESERT بلبيس الصحراوي
- ROAD-AIN-SOKHNA العين السخنة
- ROAD-NASR طريق النصر
- ROAD-90-NORTH التسعين الشمالي
- ROAD-90-SOUTH التسعين الجنوبي
- ROAD-MOHAMED-NAGUIB محور محمد نجيب
- ROAD-MBZ-NORTH محمد بن زايد الشمالي — اتضافت أسماء OSM؛ خبر الدستور بيقول التطوير خلص بس من غير ما يحدد الشمالي ولا الجنوبي
- ROAD-MBZ-SOUTH محمد بن زايد الجنوبي — اتضافت أسماء OSM؛ مفيش مصدر رسمي لحالته
- ROAD-30-JUNE محور 30 يونيو
- ROAD-EASTERN-DESERT الصحراوي الشرقي
- ROAD-AUTOSTRAD الأوتوستراد
- ROAD-CORNICHE الكورنيش
- ROAD-MOKATTAM-AXIS محور المقطم
- ROAD-WESTERN-DESERT الصحراوي الغربي
- ROAD-CAIRO-FAYOUM القاهرة–الفيوم
- ROAD-CAIRO-ASSIUT-AGRI القاهرة–أسيوط الزراعي
- ROAD-CAIRO-ALEX-DESERT إسكندرية الصحراوي
- ROAD-WAHAT الواحات
- ROAD-HARAM الهرم
- ROAD-MARYUTEYA المريوطية
- ROAD-DAHSHUR-LINK وصلة دهشور
- ROAD-AMR-IBN-ALAS محور عمرو بن العاص — الحالة partial من خبر واحد بس (EV-119)، ومافيش مصدر رسمي
- ROAD-GAMET-EL-DOWAL جامعة الدول
- ROAD-OBOUR-AXIS-NEW-CAIRO محور العبور (القاهرة الجديدة) — كيان جديد في rev5؛ خبرين عن أعمال تطوير وتوسعة (2020 و2024)، ومفيش مصدر رسمي لحالته

**city (19)** — مدينة خارج نطاق القاهرة الكبرى ومستخدمة كنقطة نهاية لطريق أو قطار. المصادر اللي ظهرت قوائم ثانوية (موضوع، ويكيبيديا)، ومالقيتش صفحة رسمية
- CITY-REHAB الرحاب — مدينة خاصة جوه القاهرة الجديدة؛ مافيش صفحة رسمية حكومية عنها
- CITY-MADINATY مدينتي — خبر (EV-038) بيقول «خلصت بالكامل» ضد الدليل «أغلبها ناضج»، ومافيش مصدر رسمي
- CITY-MOSTAKBAL المستقبل سيتي — مدينة خاصة؛ مافيش صفحة رسمية حكومية عنها
- CITY-NEW-HELIOPOLIS هليوبوليس الجديدة — تبع شركة مصر الجديدة للإسكان (قطاع أعمال) مش NUCA؛ أخبار بتقول المرافق اتشغلت والمرحلة الأولى خلصت، بس مالقيتش صفحة رسمية
- CITY-10TH-RAMADAN العاشر من رمضان — صفحة NUCA للمدينة موجودة حسب ويكيبيديا، بس مظهرتش في البحث ولا ينفع أخمّن رابطها
- CITY-NEW-SPHINX سفنكس الجديدة — under_construction من خبر واحد بس (EV-107)؛ الجهاز الرسمي موجود (AUTH-NEW-SPHINX-AGENCY)
- CITY-NEW-OCTOBER أكتوبر الجديدة — قرار الإنشاء موجود (EV-103) بس مفيش مصدر بيحدد مرحلة التنمية (شغالة/تحت الإنشاء)
- CITY-BILBEIS بلبيس
- CITY-MANSOURA المنصورة
- CITY-TANTA طنطا
- CITY-ALEXANDRIA إسكندرية
- CITY-AIN-SOKHNA العين السخنة
- CITY-MARSA-MATROUH مرسى مطروح
- CITY-ALAMEIN العلمين
- CITY-FAYOUM الفيوم
- CITY-HURGHADA الغردقة
- CITY-SAFAGA سفاجا
- CITY-QENA قنا
- CITY-ABU-SIMBEL أبو سمبل

**bridge (9)** — كوبري تاريخي شغال، بس مالقيتش صفحة رسمية عنه بالاسم (كوبري قصر النيل بس هو اللي اتحل من بوابة محافظة القاهرة)
- BRIDGE-BENHA-FLYOVER كوبري بنها العلوي
- BRIDGE-RING-NORTH-WARRAQ كوبري الدائري الشمالي (الوراق)
- BRIDGE-IMBABA كوبري إمبابة
- BRIDGE-15-MAY كوبري 15 مايو
- BRIDGE-GALAA كوبري الجلاء
- BRIDGE-GIZA كوبري الجيزة
- BRIDGE-ABBAS كوبري عباس
- BRIDGE-UNIVERSITY كوبري الجامعة
- BRIDGE-MONIB كوبري المنيب

**transit_stop (6)** — محطة مالهاش مصدر رسمي شفته بيذكرها بالاسم
- STOP-SADAT السادات — محطة تبادلية (الخط الأول والتاني)، بس مفيش صفحة رسمية شفتها بتذكرها بالاسم
- STOP-LRT-10TH-RAMADAN-1 العاشر من رمضان 1 — C17: الكيان غالباً هو محطة العاشر النهائية (المرحلة الرابعة، تحت الإنشاء حسب NAT)؛ محتاج قرار تحريري: يتدمج ولا يفضل
- STOP-AHMED-OMAR-HASHEM محطة أحمد عمر هاشم — اسم محطة التبادل الخط 6 / القطار السريع متنازع عليه (C13)
- STOP-DEMERDASH الدمرداش — محطة على الخط الأول ومحطة مقترحة على الخط السادس (خبر)؛ مفيش مصدر رسمي بالاسم
- STOP-ABBASSIA العباسية — محطة على الخط الثالث ومقترحة على السادس (خبر)؛ مفيش مصدر رسمي بالاسم
- STOP-SAYEDA-AISHA السيدة عائشة — محطة مقترحة على الخط السادس (خبر واحد)، وممكن تتحط planned لما يظهر مصدر رسمي

**landmark (7)** — معلم موجود، بس مالقيتش صفحة رسمية بتذكره في الجولة دي
- LANDMARK-MALL-OF-EGYPT مول مصر
- LANDMARK-MALL-OF-ARABIA مول العرب
- LANDMARK-BUE الجامعة البريطانية
- LANDMARK-HELWAN-UNIV جامعة حلوان
- LANDMARK-CAIRO-UNIV جامعة القاهرة
- LANDMARK-LEBANON-SQ ميدان لبنان
- LANDMARK-SPHINX-SQ سفنكس

**authority (1)** — الجهاز مذكور في الأخبار بس، من غير صفحة رسمية
- AUTH-NEW-CAIRO-AGENCY جهاز القاهرة الجديدة — رئيس الجهاز مذكور في خبر (الدستور)، ومفيش صفحة رسمية

**transit_line (2)** — خدمة نقل من غير مصدر رسمي محدد
- TRANSIT-SUEZ-TRAIN قطار السويس
- TRANSIT-SUPERJET سوبر جيت

**project (1)** — ملف/مشروع من غير مصدر رسمي محدد لحالته
- PROJ-ADDED-LANDS-REGULARIZATION ملف توفيق أوضاع الأراضي المضافة — مفيش مصدر رسمي محدد لحالة الملف

### نقاط للمراجعة
- **قاعدة corroborated للحالة** (فوق): قرار تحريري جديد، اتطبق على محطات المرحلة التانية من BRT بس.
- **الخط الثالث**: أرقام GOPP (47.87 كم / 22 محطة، ديسمبر 2022) اتسجلت superseded مش disputed، لأنها قاعدة بيانات تخطيط قبل اكتمال الخط (أكتوبر 2024)، وNAT هي المرجع التنفيذي الأحدث. لو عايزها disputed قولي.
- **المرحلة التانية من BRT**: 16 (الرئاسة) و15 (مجلس الوزراء 13/9) و14 (مصراوي 26/9) بيعبروا عن تعريفات مختلفة للمرحلة، مش بالضرورة أخطاء. القيمة الـ16 اتغيرت من verified لـ disputed.
- **كباري شبرا «2.1 كم و5.1 كم»**: متسجلة زي ما ورد بالنص العربي، والتقرير بيرجّح إن 5.1 أصلها 1.5.
- **طريق شرق الرياح التوفيقي**: SIS (رسمي) بتقول المرحلة الأولى خلصت (partial) ضد under_construction. الحالة على الكيان فضلت under_construction لحد ما يتحسم.
- **الخصوص**: الكيان DIST-KHOSOUS متسجل district، بس التقسيم الإداري الرسمي بيقول إنها مدينة. اتضافت حقيقة admin_type، والنوع ماتغيرش (عشان الأكواد تفضل زي ما هي).
- **من تقرير الشمال، ما اتدمجش**: مجموعة «كباري النيل والسكك الحديدية» (مجموعة مش كيان واحد)، شبكة السكك الحديدية بالقليوبية، مشروعات تطوير المطرية وعين شمس، الصفا/العكرشة/عزبة نجيب (أخبار بس)، حياة كريمة، وملف التصالح. دي برامج أو مجموعات مش كيانات مكانية، وممكن تتضاف لو حبيت.
- **محطات المترو القديمة** (السادات، الدمرداش، العباسية): أكيد شغالة، بس ماشفتش مصدر رسمي بيذكرها بالاسم، فسبتها unknown بدل ما أستنتج.
