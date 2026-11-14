# Greater Cairo Atlas — Seed revision 6 · CHANGELOG

## rev6 — 2026-11-14 (التحقق من الكيانات الـ104 اللي كانت unknown + EV-042/045/046)

Baseline: rev5 (342 entities، 1108 facts، 198 evidence). المدخلات: تقارير التحقق التلاتة من Drive: Gemini (doc 1iTUiQvq…)، Perplexity (جولتين، 1tI8wOXu…)، ChatGPT (الجولة التانية، 11_4nWNh…)، ومعاهم تحقق بنفسي على الويب.

مفيش كيان اتمسح ولا كود اتغير، ومفيش حقيقة اتمسحت ولا قيمتها اتعدلت. الكيانات القديمة اتغير فيها `status` وaliases بس. الحقائق القديمة اتغير فيها `verification_state` بس (حقيقة واحدة). EV-042 اتغير فيه `source_url`، وEV-045/046 (ومعاهم EV-154 وبعض السجلات القديمة اللي الباحثين استشهدوا بيها) اتضافلهم ملاحظة. نفس الأعمدة والصيغ بتاعة rev5.

### الإجماليات
| | rev5 | rev6 |
|---|---|---|
| Entities | 342 | 342 (مفيش كيانات جديدة) |
| Facts | 1108 | **1297** (+189) |
| Evidence | 198 | **305** (+107: 38 برابط كامل · 69 من Gemini من غير رابط) |
| Status `unknown` | 104 | **48** |

حالة الكيانات: operational 246 · unknown 48 · under_construction 36 · planned 7 · partial 3 · approved_planned 2.

حالات الحقائق: candidate 657 · verified 310 · single_source 131 · disputed 91 · corroborated 85 · superseded 14 · rejected 9.

### قواعد rev6
- **مصادر Gemini** كلها مذكور فيها الدومين بس (مثلاً «presidency.eg») من غير رابط صفحة، فمستحيل أتحقق منها. اتسجلت كأدلة بـ `source_url = null` وملاحظة صريحة، ومفيش حقيقة من Gemini لوحده بتغير حالة كيان. لو اتفق مع باحث تاني، الحقيقة بتبقى corroborated.
- **الحالة اتحددت** بواحدة من التلاتة دول: (V) صفحة رسمية فتحتها بنفسي، والحقيقة verified؛ أو (O) رابط رسمي كامل ذكره باحث ومقدرتش أفتحه، والحقيقة candidate، زي rev4/5؛ أو (CN) مصدرين مستقلين أو أكتر متفقين وفيهم رابط كامل، والحقيقة corroborated، وده امتداد لقاعدة rev5.
- **لما الباحثين بيختلفوا** (D)، القيم كلها بتتسجل disputed جنب بعض، والحالة بتتاخد من أقوى مصدر رسمي، ومفيش planned/approved بيترقى لـ operational (السكريبت بيتأكد من ده).
- **مواقع منعت الجلب الآلي في الجولة دي:** sis.gov.eg، giza.gov.eg، alamiria.com (الوقائع المصرية)، cabinet.gov.eg، cu.edu.eg، helwan.edu.eg، alexandria.gov.eg، mallofarabia.net. الأدلة دي فضلت candidate.
- **صفحات فتحتها بنفسي:** ملف مسارات أتوبيسات محافظة القاهرة، وصفحة ممشى أهل مصر، ودليل المطاعم السياحية بوزارة السياحة (الجيزة)، وصفحة منشآت BUE، وصفحة زيارة Mall of Egypt، وأخبار فيتو والشروق. صفحات redsea.gov.eg فتحت بالعنوان بس من غير محتوى.
- **المصادر الثانوية** (Property Plus، OSM wiki، مرصد عمران) ماخلتش حاجة verified لوحدها.

### EV-042 / EV-045 / EV-046
- **EV-042**: source_url → https://www.cabinet.gov.eg/News/Details/86141
- **EV-045**: لسه من غير رابط؛ البديل الرسمي اتسجل كسجل جديد EV-208
- **EV-046**: لسه من غير رابط؛ البديل الرسمي اتسجل كسجل جديد EV-209
- EV-045: البديل الرسمي (صفحة الرئاسة «افتتاح الطريق الدائري الأوسطي»، 2022-03) هو **نفس الرابط** الموجود من rev4 في EV-082. اتعمل سجل جديد منفصل زي ما طلبت، ومربوط بحقيقتين جداد (length 156، operational_status). مارتبطش بحقيقة الـ155 كم، لأن الصفحة بتقول 156.
- EV-046: سجل SIS الجديد (Story/308313، 2025-05-09) مربوط بحقائق جديدة لـ TRANSIT-MONORAIL-WEST: under_construction، 43.8 كم، 13 محطة.
- Gemini قال إنه لقى رابط الرئاسة بتاريخ 18 ديسمبر 2020، بس مااداش الرابط، فاتسجل كادعاء مش متحقق منه.

### تغييرات الحالة (56) والمصادر
| entity | rev5 → rev6 | القاعدة | الباحثين | السبب / المصدر |
|---|---|---|---|---|
| ROAD-AUTOSTRAD | unknown → **operational** | V | Gemini، Perplexity | خط أتوبيس 1132 بيمر بالأوتوستراد (ملف مسارات المحافظة) (EV-198، EV-210) |
| ROAD-HARAM | unknown → **operational** | V | Gemini، Perplexity | خطوط 8 و351 و997 و1095 بتمر بشارع الهرم (EV-198، EV-211) |
| ROAD-CORNICHE | unknown → **operational** | V | Claude، Gemini، Perplexity | خطوط أتوبيس بتمر بكورنيش النيل، وممشى أهل مصر عليه (EV-199، EV-198، EV-210) |
| ROAD-NASR | unknown → **operational** | V | Claude، Gemini، Perplexity | خبر حي غرب مدينة نصر (2026-09-21) + خطوط أتوبيس على طريق النصر (EV-212، EV-198، EV-213) |
| BRIDGE-IMBABA | unknown → **operational** | V | Gemini، Perplexity | ممشى أهل مصر «من كوبري إمبابة حتى كوبري 15 مايو» (افتتاح 2022) (EV-199، EV-214) |
| BRIDGE-15-MAY | unknown → **operational** | V | Claude، Gemini، Perplexity | خطوط أتوبيس (1012، 1047…) + الممشى + خبر غلق جزئي للصيانة 2026-07-02 (مصراوي) (EV-215، EV-198، EV-199، EV-216) |
| BRIDGE-UNIVERSITY | unknown → **operational** | V | Gemini، Perplexity | خطوط أتوبيس كتير بتعدي كوبري الجامعة (EV-198، EV-217) |
| BRIDGE-GALAA | unknown → **operational** | O | Gemini، Perplexity | ملف الأتوبيسات بيذكر «كوبري الجلاء» (خطوط 186 و1031 و1109)، بس فيه كمان كوبري الجلاء العلوي في مصر الجديدة، فالمطابقة مش أكيدة 100% (EV-198، EV-218) |
| DIST-MOHANDESSIN | unknown → **operational** | V | ChatGPT، Gemini | دليل وزارة السياحة: منشآت شغالة بعناوين في المهندسين (EV-200، EV-219) |
| DIST-FAISAL | unknown → **operational** | V | ChatGPT، Gemini | دليل وزارة السياحة: «… المريوطية – فيصل - الجيزة» (EV-200، EV-220) |
| LANDMARK-LEBANON-SQ | unknown → **operational** | V | ChatGPT، Gemini | دليل وزارة السياحة: «5 ميدان لبنان – المهندسين» (EV-200، EV-219) |
| LANDMARK-SPHINX-SQ | unknown → **operational** | V | ChatGPT، Gemini | دليل وزارة السياحة: «3 ميدان سفنكس» (EV-200، EV-219) |
| ROAD-GAMET-EL-DOWAL | unknown → **operational** | V | Claude، Gemini | دليل وزارة السياحة: «17 شارع جامعة الدول العربية - المهندسين» (EV-200، EV-216) |
| LANDMARK-BUE | unknown → **operational** | V | ChatGPT، Gemini | صفحة الجامعة: حرم 40 فدان في الشروق، 17+ مبنى، 89 أتوبيس (EV-201، EV-221) |
| LANDMARK-MALL-OF-EGYPT | unknown → **operational** | V | ChatGPT، Gemini | صفحة المول: العنوان ومواعيد الفتح (EV-202، EV-220) |
| ROAD-BENHA-MANSOURA | unknown → **operational** | O | Gemini، Perplexity | صفحة الرئاسة: كوبري صهرجت العلوي على طريق بنها/المنصورة خلص (EV-222، EV-223) |
| ROAD-DABAA-AXIS | unknown → **operational** | O | Gemini، Perplexity | الرئاسة 2021-01-08: محور الضبعة من الطرق الجديدة المرصوفة (EV-224، EV-225) |
| ROAD-ISMAILIA-AGRI | unknown → **operational** | O | Gemini، Perplexity | صفحة افتتاح الأوسطي: بيبدأ من طريق مصر/الإسماعيلية الزراعي (EV-208، EV-210) |
| ROAD-BILBEIS-DESERT | unknown → **operational** | O | Gemini، Perplexity | صفحة قطاع الأوسطي: طريق القاهرة/بلبيس الصحراوي محور قائم؛ Gemini: صفحة NUCA للعبور (EV-226، EV-227) |
| BRIDGE-BENHA-FLYOVER | unknown → **operational** | O | Gemini، Perplexity | صفحة الرئاسة لكوبري بنها على النيل. تنبيه: الكيان ده (6.5 كم، بيعدي فرع دمياط) غالباً نسخة مكررة من BRIDGE-BENHA-NILE (EV-154، EV-228) |
| ROAD-REGIONAL-RING | unknown → **partial** | D | Gemini، Perplexity | الباحثين قالوا operational، بس دليلهم بيثبت قطاعات بس. توجيه الرئاسة EV-090 (دراسة إغلاق قطاعات) لسه قائم، فالحالة على الكيان partial (الأحوط) والتعارض C9 فاضل (EV-154، EV-228) |
| STOP-SAYEDA-AISHA | unknown → **planned** | O | Gemini، Perplexity | SIS 2025-11-01: المرحلة 2 من الخط الرابع تحت الدراسة، ومحطة تبادلية مع الخط السادس في السيدة عائشة (EV-229، EV-230) |
| AUTH-NEW-CAIRO-AGENCY | unknown → **operational** | O | Gemini، Perplexity | SIS 2024-05-28: الجهاز بيعرض المشروعات على الوزير (EV-231، EV-232) |
| BRIDGE-GIZA | unknown → **operational** | O | Gemini، Perplexity | جرد مديرية الطرق بالجيزة (Perplexity: 770 م؛ Gemini: 3000 م، طول متنازع عليه) (EV-233، EV-234) |
| BRIDGE-ABBAS | unknown → **operational** | O | Gemini، Perplexity | صفحة حي جنوب الجيزة: كوبري عباس حد قائم؛ Gemini: 470 م بحالة جيدة (EV-235، EV-234) |
| CITY-10TH-RAMADAN | unknown → **operational** | O | ChatGPT، Gemini | اسمها وارد كقسم/مركز أو دائرة في تقسيم الدوائر الرسمي (الوقائع المصرية 2025-06-04) (EV-236، EV-237) |
| CITY-BILBEIS | unknown → **operational** | O | ChatGPT، Gemini | اسمها وارد كقسم/مركز أو دائرة في تقسيم الدوائر الرسمي (الوقائع المصرية 2025-06-04) (EV-236، EV-238) |
| CITY-MANSOURA | unknown → **operational** | O | ChatGPT، Gemini | اسمها وارد كقسم/مركز أو دائرة في تقسيم الدوائر الرسمي (الوقائع المصرية 2025-06-04) (EV-236، EV-218) |
| CITY-TANTA | unknown → **operational** | O | ChatGPT، Gemini | اسمها وارد كقسم/مركز أو دائرة في تقسيم الدوائر الرسمي (الوقائع المصرية 2025-06-04) (EV-236، EV-238) |
| CITY-MARSA-MATROUH | unknown → **operational** | O | ChatGPT، Gemini | اسمها وارد كقسم/مركز أو دائرة في تقسيم الدوائر الرسمي (الوقائع المصرية 2025-06-04) (EV-236، EV-218) |
| CITY-FAYOUM | unknown → **operational** | O | ChatGPT، Gemini | اسمها وارد كقسم/مركز أو دائرة في تقسيم الدوائر الرسمي (الوقائع المصرية 2025-06-04) (EV-236، EV-239) |
| CITY-QENA | unknown → **operational** | O | ChatGPT، Gemini | اسمها وارد كقسم/مركز أو دائرة في تقسيم الدوائر الرسمي (الوقائع المصرية 2025-06-04) (EV-236، EV-238) |
| DIST-KATAMEYA | unknown → **operational** | O | ChatGPT، Gemini | اسمها وارد كقسم/مركز أو دائرة في تقسيم الدوائر الرسمي (الوقائع المصرية 2025-06-04) (EV-236، EV-240) |
| DIST-HADAEK-OCTOBER | unknown → **operational** | O | ChatGPT، Gemini | اسمها وارد كقسم/مركز أو دائرة في تقسيم الدوائر الرسمي (الوقائع المصرية 2025-06-04) (EV-236، EV-232) |
| CITY-ALAMEIN | unknown → **operational** | O | ChatGPT، Gemini | العلمين (القديمة) وارد كقسم إداري في تقسيم الدوائر. Gemini خلط بينها وبين العلمين الجديدة، والاتنين كيانات منفصلة (EV-236، EV-241) |
| CITY-ALEXANDRIA | unknown → **operational** | O | ChatGPT، Gemini | بوابة محافظة الإسكندرية الرسمية (EV-242، EV-243) |
| CITY-AIN-SOKHNA | unknown → **operational** | O | ChatGPT، Gemini | صفحة SIS السياحية: العين السخنة مدينة ساحلية (EV-244، EV-245) |
| CITY-HURGHADA | unknown → **operational** | O | ChatGPT، Gemini | دليل مدن محافظة البحر الأحمر (المحتوى ما ظهرش لما فتحته) + Gemini (EV-246، EV-247) |
| CITY-SAFAGA | unknown → **operational** | O | ChatGPT، Gemini | صفحة مدينة سفاجا على بوابة المحافظة (المحتوى ما ظهرش لما فتحته) + Gemini (EV-248، EV-249) |
| CITY-ABU-SIMBEL | unknown → **operational** | O | ChatGPT، Gemini | حصاد SIS 2025: قصر ثقافة أبو سمبل شغال؛ Gemini: افتتاح يناير 2026 (EV-250، EV-251) |
| DIST-GARDEN-CITY | unknown → **operational** | O | ChatGPT، Gemini | حصاد SIS 2025: افتتاح قصر ثقافة الطفل بجاردن سيتي (EV-250، EV-252) |
| DIST-REMAYA | unknown → **operational** | O | ChatGPT، Gemini | تقارير محافظة الجيزة (2017–2018) عن مناطق سكنية وخدمات (EV-253، EV-219) |
| DIST-HADAYEK-AHRAM | unknown → **operational** | O | ChatGPT، Gemini | تقارير محافظة الجيزة (2017–2018) عن مناطق سكنية وخدمات (EV-253، EV-254) |
| DIST-SAFT-ELLABAN | unknown → **operational** | O | ChatGPT، Gemini | تقارير محافظة الجيزة (2017–2018) عن مناطق سكنية وخدمات (EV-253، EV-255) |
| DIST-ABU-RAWASH | unknown → **operational** | O | ChatGPT، Gemini | دليل مديرية التموين بالجيزة بيذكر المنطقة بالاسم (EV-256، EV-257) |
| DIST-MANSHEYET-BAKARY | unknown → **operational** | O | ChatGPT، Gemini | دليل مديرية التموين بالجيزة بيذكر المنطقة بالاسم (EV-256، EV-219) |
| LANDMARK-MALL-OF-ARABIA | unknown → **operational** | O | ChatGPT، Gemini | موقع المول الرسمي (مقدرتش أفتحه) + Gemini (EV-258، EV-220) |
| LANDMARK-CAIRO-UNIV | unknown → **operational** | O | ChatGPT، Gemini | صفحة معلومات الزيارة في جامعة القاهرة + Gemini (EV-259، EV-260) |
| LANDMARK-HELWAN-UNIV | unknown → **operational** | O | ChatGPT، Gemini | موقع الجامعة؛ الاسم الحالي «جامعة العاصمة (حلوان سابقاً)» (EV-261، EV-262) |
| DIST-DOWNTOWN | unknown → **operational** | CN | ChatGPT، Gemini | Financial Times (2025-03): ترميم وفنادق ومكاتب شغالة + Gemini (SIS 2026-08-17) (EV-263، EV-264) |
| ROAD-90-NORTH | unknown → **operational** | CN | Claude، Gemini، Perplexity | أخبار متعددة عن تطوير وتجميل محور قائم (المال، أموال الغد 2025-08-25) + Property Plus + Gemini (EV-265، EV-205، EV-206، EV-266) |
| ROAD-90-SOUTH | unknown → **operational** | CN | Claude، Gemini، Perplexity | Property Plus (امتداد 4.2 كم خلص) + أخبار اليوم + Gemini (EV-265، EV-207، EV-267) |
| CITY-NEW-OCTOBER | unknown → **partial** | D | ChatGPT، Gemini | SIS 2026-11-02 (رسمي): حوالي 100 ألف وحدة خلصت أو جاري تنفيذها، فالحالة partial. Gemini قال operational من غير رابط (EV-268، EV-269) |
| DIST-CAPITAL-GARDENS | unknown → **under_construction** | D | ChatGPT، Gemini | SIS 2026-09-07 (رسمي): مشروعات سكنية وخدمية جاري تنفيذها. Gemini قال operational (NUCA 2021) من غير رابط (EV-270، EV-271) |
| ROAD-OBOUR-AXIS-NEW-CAIRO | unknown → **under_construction** | D | Gemini، Perplexity | SIS 2024-05-28 (رسمي): 2.8 كم جاري تطويره. Gemini بيقول خبر 2024-06-06 (اليوم السابع) إن التطوير خلص، من غير رابط. الحالة اتسجلت as-of مايو 2024 (EV-231، EV-272) |
| CITY-NEW-SPHINX | unknown → **approved_planned** | D | ChatGPT، Gemini | حسب تعليمات المالك: approved_planned لحد ما يظهر دليل على إنشاء فعلي. مرصد عمران (ثانوي) بيوثق القرار الوزاري 90/2020 والحيز المعتمد. Gemini قال partial (MHUC 2026-02-23) من غير رابط. ملحوظة: نص القرار الرسمي مش موجود في الداتا (EV-273، EV-274) |

### تعليمات المالك اللي اتطبقت
- **العلمين**: CITY-ALAMEIN هي العلمين القديمة (مدرجة كقسم إداري في تقسيم الدوائر الرسمي). Gemini خلط بينها وبين العلمين الجديدة. ماعملتش كيان للعلمين الجديدة في rev6، والاتنين يفضلوا منفصلين.
- **حدائق أكتوبر**: DIST-HADAEK-OCTOBER منفصلة عن CITY-NEW-OCTOBER. الأولى operational (دائرة إدارية رسمية)، والتانية partial (SIS: 100 ألف وحدة خلصت أو جاري تنفيذها).
- **جامعة حلوان**: اتضافت aliases «جامعة العاصمة»، «جامعة العاصمة (حلوان سابقاً)»، «Capital University»، «Capital University (formerly Helwan University)»، ومعاها حقيقة `current_name` (candidate، المصدر موقع الجامعة عن طريق ChatGPT).
- **سفنكس الجديدة**: approved_planned. حقيقة under_construction (خبر واحد EV-107) بقت disputed، وpartial بتاع Gemini (من غير رابط) disputed كمان. **ملحوظة:** نص القرار الرسمي مش موجود في الداتا، والحالة معتمدة على مرصد عمران (ثانوي) وEV-107 وتعليماتك.
- **المصادر الثانوية**: مرصد عمران وOSM wiki وProperty Plus اتسجلوا single_source أو جزء من corroborated، ومفيش واحد منهم عمل verified.

### تصحيحات على ادعاءات الباحثين
- **DIST-TAHRIR**: مصدر ChatGPT (دليل التموين بالجيزة) عن «شارع التحرير» في الجيزة، مش ميدان التحرير في القاهرة، فاتسجل rejected.
- **ROAD-30-JUNE**: Perplexity قال partial، بس مقال الشروق (فتحته) بيتكلم عن رفع كفاءة 7.5 كم من 95 كم في طريق موجود. اتسجل كـ upgrade_progress مش كحالة.
- **ROAD-MARG-AXIS**: Perplexity قال «مؤجل لـ2030»، والمقال (فتحته) مفيهوش ده. المقال بيأكد بس قرار المنفعة العامة 2449/2026 والتعويضات.
- **ROAD-MOHAMED-NAGUIB**: مصدر Perplexity (SIS 2024-05) عن امتداد حوالي 2 كم تحت التطوير، فاتسجل كـ extension_status ومش حالة المحور.
- **BRIDGE-GALAA**: ملف الأتوبيسات بيذكر «كوبري الجلاء»، بس ممكن يكون كوبري الجلاء العلوي في مصر الجديدة. الحقيقة نزلت لـ candidate بدل verified.
- **BRIDGE-BENHA-FLYOVER**: نفس الطول (6.5 كم) ونفس صفحة الرئاسة بتاعة BRIDGE-BENHA-NILE، فغالباً كيان مكرر. اتضافت حقيقة possible_duplicate_of، ومفيش دمج (عشان مفيش حذف).
- **BRIDGE-GIZA**: الطول متنازع عليه: 770 م (Perplexity) ضد 3000 م (Gemini).
- **ROAD-REGIONAL-RING**: الباحثين الاتنين قالوا operational، بس دليلهم بيثبت قطاعات بس، وتوجيه الرئاسة EV-090 لسه قائم. اتحطت partial (الأحوط)، والتعارض C9 فاضل.

### لسه unknown (48) والسبب
**road (17)**
- ROAD-REGIONAL-NW-ARC القوس الشمالي الغربي للإقليمي — Gemini بس (presidency.eg، 2018-09-09) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-MARG-AXIS محور المرج — قرار رئيس الوزراء 2449/2026 (منفعة عامة واستيلاء) منقول في خبر (فيتو)، فالمشروع معتمد. Gemini قال under_construction (خبر 2025) من غير رابط. مفيش مصدر رسمي برابط، فالحالة فاضلة unknown. Perplexity قال «مؤجل لـ2030» والمقال مفيهوش ده
- ROAD-AIN-SOKHNA العين السخنة — Gemini بس (seglat.mod.gov.eg، 2026-11-08) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-MOHAMED-NAGUIB محور محمد نجيب — مصدر SIS بيتكلم عن الامتداد بس (حوالي 2 كم، تحت التطوير 2024-05). حالة المحور نفسه (operational) جاية من Gemini من غير رابط
- ROAD-MBZ-NORTH محمد بن زايد الشمالي — Gemini بس (youm7.com، 2024-04-04) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-MBZ-SOUTH محمد بن زايد الجنوبي — Gemini بس (youm7.com، 2024-04-04) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-30-JUNE محور 30 يونيو — Perplexity قال partial، بس المصدر (الشروق) بيتكلم عن تطوير طريق موجود مش تشغيل جزئي، فما اتسجلش كحالة. Gemini قال operational من غير رابط
- ROAD-EASTERN-DESERT الصحراوي الشرقي — Gemini بس (presidency.eg، 2020-12-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-MOKATTAM-AXIS محور المقطم — Gemini بس (youm7.com، 2023-08-24) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-WESTERN-DESERT الصحراوي الغربي — Gemini بس (presidency.eg، 2020-12-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-CAIRO-FAYOUM القاهرة–الفيوم — Gemini بس (presidency.eg، 2018-09-09) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-CAIRO-ASSIUT-AGRI القاهرة–أسيوط الزراعي — Gemini بس (giza.gov.eg، 2025-01-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-CAIRO-ALEX-DESERT إسكندرية الصحراوي — Gemini بس (mod.gov.eg، 2026-09-05) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-WAHAT الواحات — Gemini بس (lands.nuca.gov.eg، 2026-08-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-MARYUTEYA المريوطية — Gemini بس (sis.gov.eg، 2026-09-13) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-DAHSHUR-LINK وصلة دهشور — Gemini بس (newcities.gov.eg، 2026-02-28) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- ROAD-AMR-IBN-ALAS محور عمرو بن العاص — Gemini بس (giza.gov.eg، 2025-09-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر

**district (17)**
- DIST-TAHRIR التحرير — مصدر ChatGPT عن شارع التحرير في الجيزة (rejected)؛ مفيش غير Gemini من غير رابط
- DIST-HUSSEIN-AZHAR الحسين والأزهر — Gemini بس (sis.gov.eg، 2026-08-17) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-FUSTAT الفسطاط — Gemini بس (cairo.gov.eg، 2020-01-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-MANIAL المنيل — Gemini بس (sis.gov.eg، 2025-09-25) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-OM-BAYOUMI أم بيومي — Gemini بس (youm7.com، 2026-11-02) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-NARGES النرجس — Gemini بس (newcities.gov.eg، 2026-02-28) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-DEGLA دجلة — Gemini بس (mpbs.gov.eg، 2020-01-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-ZAHRAA-MAADI زهراء المعادي — Gemini بس (mpbs.gov.eg، 2020-01-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-MERAJ المعراج — Gemini بس (nat.gov.eg، 2024-04-22) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-NEW-MAADI المعادي الجديدة — Gemini بس (mpbs.gov.eg، 2020-01-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-HADAEK-ASHGAR حدائق الأشجار — Gemini بس (giza.gov.eg، 2021-12-04) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-SMART-VILLAGE القرية الذكية — Gemini بس (giza.gov.eg، 2020-01-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-MANSOURIYA المنصورية — Gemini بس (giza.gov.eg، 2020-01-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-JURIAN جريان — Gemini بس (sis.gov.eg، 2026-08-16) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-GREEN-SARAYA السرايا الخضرا — الباحثين التلاتة مالقوش مصدر. Gemini: not found as an official administrative district in Greater Cairo (colloquially used in Egyptian Arabic for Abbassia Mental Health Hospital).
- DIST-MIT-ELEZZ ميت العز — Gemini بس (rdis.moss.gov.eg، 2026-01-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- DIST-DAQADOS دقادوس — Gemini بس (eta.gov.eg، 2026-01-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر

**transit_stop (5)**
- STOP-SADAT السادات — Gemini بس (cairometro.gov.eg، 2026-01-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- STOP-LRT-10TH-RAMADAN-1 العاشر من رمضان 1 — Gemini بس (nat.gov.eg، 2026-09-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- STOP-AHMED-OMAR-HASHEM محطة أحمد عمر هاشم — Gemini بس (sis.gov.eg، 2026-09-06) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- STOP-DEMERDASH الدمرداش — Gemini بس (cairometro.gov.eg، 2024-04-22) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- STOP-ABBASSIA العباسية — Gemini بس (nat.gov.eg، 2019-06-15) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر

**city (4)**
- CITY-REHAB الرحاب — Gemini بس (newcities.gov.eg، 2026-01-01) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- CITY-MADINATY مدينتي — OSM wiki (ثانوي) نفسه بيقول إنه مش بيثبت الحالة؛ Gemini من غير رابط
- CITY-MOSTAKBAL المستقبل سيتي — OSM wiki (ثانوي) نفسه بيقول إنه مش بيثبت الحالة؛ Gemini من غير رابط
- CITY-NEW-HELIOPOLIS هليوبوليس الجديدة — Gemini بس (sis.gov.eg، 2026-01-27) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر

**bridge (2)**
- BRIDGE-RING-NORTH-WARRAQ كوبري الدائري الشمالي (الوراق) — Gemini بس (youm7.com، 2026-03-28) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- BRIDGE-MONIB كوبري المنيب — Gemini بس (youm7.com، 2026-01-15) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر

**transit_line (2)**
- TRANSIT-SUEZ-TRAIN قطار السويس — Gemini بس (youm7.com، 2022-10-07) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر
- TRANSIT-SUPERJET سوبر جيت — Gemini بس (sis.gov.eg، 2026-07-18) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر

**project (1)**
- PROJ-ADDED-LANDS-REGULARIZATION ملف توفيق أوضاع الأراضي المضافة — Gemini بس (mhuc.gov.eg، 2026-07-11) ذكر الدومين من غير رابط صفحة، والباحثين التانيين مالقوش مصدر

### الخطوة الجاية
- أغلب الكيانات اللي لسه unknown عليها ادعاء من Gemini بس. لو Gemini اتطلب منه **الروابط الكاملة** للصفحات اللي ذكرها (الطرق الإقليمية، محطات المترو، الأحياء الفرعية)، أغلبها هيتحسم في rev7.
- قرار دمج BRIDGE-BENHA-FLYOVER مع BRIDGE-BENHA-NILE.
