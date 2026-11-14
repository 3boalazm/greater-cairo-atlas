# Greater Cairo Atlas — Seed revision 6.1 · CHANGELOG

## rev6.1 — 2026-11-14 (تصحيح جودة على rev6 قبل الاستيراد)

Baseline: rev6 (342 entities، 1297 facts، 305 evidence). مفيش كيان ولا حقيقة ولا دليل اتمسح، ومفيش قيمة حقيقة اتعدلت. اللي اتغير: `source_type` لسجلات Gemini، و`verification_state` لبعض الحقائق، و`status` لـ 3 كيانات، ومعاهم 4 حقائق جديدة ودليلين جداد. نفس الأعمدة والصيغ بتاعة rev6.

### الإجماليات
| | rev6 | rev6.1 |
|---|---|---|
| Entities | 342 | 342 |
| Facts | 1297 | 1301 (+4) |
| Evidence | 305 | 307 (+2) |
| روابط حقيقة→دليل | 1407 | 1411 |
| Status unknown | 48 | **47** |
| verified | 310 | 310 |
| corroborated | 85 | **32** |
| single_source | 131 | 89 |
| candidate | 657 | 762 |
| disputed | 91 | 84 |

حالة الكيانات: operational 245 · unknown 47 · under_construction 36 · planned 8 · partial 4 · approved_planned 2.

### 1) سجلات Gemini (دومين بس) بقت secondary
- عددها **69 سجل** (EV-210 … EV-304)، كلها `source_url = null` وعنوانها «Gemini verification: …». ده عددها الفعلي في rev6: باقي الأرقام في النطاق EV-210…EV-304 سجلات برابط كامل من Perplexity وChatGPT ومن تحققي أنا، وفضلت زي ما هي. **قبل:** 56 official و13 news. **دلوقتي:** كلها secondary.
- EV-045 وEV-046 فضلوا official من غير رابط (unresolved)، وماتغيروش.

### 2) و 3) حالات الحقائق (107 تغيير)
- corroborated → candidate: 52
- single_source → candidate: 47
- disputed → candidate: 6
- disputed → superseded: 1
- corroborated → single_source: 1
- أي حقيقة دليلها Gemini بس بقت **candidate**. بما فيها 6 حقائق كانت disputed؛ التعارض لسه ظاهر لأن الطرف التاني لسه disputed وجنبها.
- **corroborated** بقت محتاجة مصدرين مستقلين برابط كامل على الأقل (السكريبت بيتأكد). الـ32 اللي فضلوا corroborated كلهم عندهم رابطين مستقلين أو أكتر.
- حقيقة اتقلبت superseded: ROAD-MARG-AXIS operational_status = approved_planned، واتسجلت تاني بقيمة planned (شوف 5).

### 4) مراجعة حالات الكيانات اللي اتغيرت في rev6
- كل كيان اتغيرت حالته في rev6 اتفحص: لازم يكون عليه حقيقة حالة مدعومة برابط رسمي، أو مصدرين مستقلين برابط.
- **DIST-DOWNTOWN: operational → unknown.** المصدر الوحيد برابط هو Financial Times (خبر واحد). من غير Gemini مفيش corroboration.
- كل الباقي فضل زي ما هو، لأنه معتمد على رابط رسمي (فتحته أنا، أو candidate)، أو على أكتر من مصدر برابط (التسعين الشمالي: Property Plus + المال + أموال الغد؛ التسعين الجنوبي: Property Plus + أخبار اليوم). CITY-NEW-SPHINX فضلت approved_planned بناءً على تعليماتك في rev6.

### 5) الطرق التلاتة من ملف Perplexity
- **ROAD-30-JUNE: unknown → partial.** الشروق 2026-10-20 (الرابط اتفتح)، single_source بناءً على طلب المالك. **ملاحظة:** المقال بيقول رفع كفاءة 7.5 كم من 95 كم خلص والباقي مخطط تطويره. ده تطوير لطريق موجود، والـ partial هنا معناه «التطوير مكتمل جزئياً» مش «التشغيل جزئي»
- **ROAD-MARG-AXIS: unknown → planned.** فيتو 2026-09-10 (الرابط اتفتح): قرار رئيس الوزراء 2449/2026 بالمنفعة العامة والاستيلاء. single_source بناءً على طلب المالك. ادعاء «مؤجل لـ2030» مش موجود في المقال
- **ROAD-MOHAMED-NAGUIB:** الحالة ماتحطتش. رابط SIS (2024-05-28) بيمنع الجلب، فمقدرتش أتحقق منه. نفس المحتوى ظهر في موقع ثانوي (هتلاقي)، وبيقول إن **الامتداد** (حوالي 2 كم) هو اللي تحت التطوير، مش المحور كله. اتضافت حقيقة extension_status كـ single_source
- **ROAD-OBOUR-AXIS-NEW-CAIRO:** اتضاف دليل تاني برابط (ماسبيرو 2024-06-06: محور 2.8 كم «جاري تنفيذه»)، فالحالة under_construction بقت معتمدة على مصدرين.
- **دليلين جداد:** EV-305 (هتلاقي (موقع سيارات))، EV-306 (ماسبيرو).

### لسه unknown (47)
نفس قائمة rev6 (CHANGELOG_rev6.md)، مع التلات تغييرات دول: اتضاف DIST-DOWNTOWN، وخرج ROAD-30-JUNE (partial) وROAD-MARG-AXIS (planned).

<details><summary>القائمة</summary>

- ROAD-REGIONAL-NW-ARC القوس الشمالي الغربي للإقليمي
- ROAD-AIN-SOKHNA العين السخنة
- ROAD-MOHAMED-NAGUIB محور محمد نجيب
- ROAD-MBZ-NORTH محمد بن زايد الشمالي
- ROAD-MBZ-SOUTH محمد بن زايد الجنوبي
- ROAD-EASTERN-DESERT الصحراوي الشرقي
- ROAD-MOKATTAM-AXIS محور المقطم
- ROAD-WESTERN-DESERT الصحراوي الغربي
- ROAD-CAIRO-FAYOUM القاهرة–الفيوم
- ROAD-CAIRO-ASSIUT-AGRI القاهرة–أسيوط الزراعي
- ROAD-CAIRO-ALEX-DESERT إسكندرية الصحراوي
- ROAD-WAHAT الواحات
- ROAD-MARYUTEYA المريوطية
- ROAD-DAHSHUR-LINK وصلة دهشور
- ROAD-AMR-IBN-ALAS محور عمرو بن العاص
- BRIDGE-RING-NORTH-WARRAQ كوبري الدائري الشمالي (الوراق)
- BRIDGE-MONIB كوبري المنيب
- TRANSIT-SUEZ-TRAIN قطار السويس
- TRANSIT-SUPERJET سوبر جيت
- STOP-SADAT السادات
- STOP-LRT-10TH-RAMADAN-1 العاشر من رمضان 1
- STOP-AHMED-OMAR-HASHEM محطة أحمد عمر هاشم
- STOP-DEMERDASH الدمرداش
- STOP-ABBASSIA العباسية
- CITY-REHAB الرحاب
- CITY-MADINATY مدينتي
- CITY-MOSTAKBAL المستقبل سيتي
- CITY-NEW-HELIOPOLIS هليوبوليس الجديدة
- DIST-DOWNTOWN وسط البلد
- DIST-TAHRIR التحرير
- DIST-HUSSEIN-AZHAR الحسين والأزهر
- DIST-FUSTAT الفسطاط
- DIST-MANIAL المنيل
- DIST-OM-BAYOUMI أم بيومي
- DIST-NARGES النرجس
- DIST-DEGLA دجلة
- DIST-ZAHRAA-MAADI زهراء المعادي
- DIST-MERAJ المعراج
- DIST-NEW-MAADI المعادي الجديدة
- DIST-HADAEK-ASHGAR حدائق الأشجار
- DIST-SMART-VILLAGE القرية الذكية
- DIST-MANSOURIYA المنصورية
- DIST-JURIAN جريان
- DIST-GREEN-SARAYA السرايا الخضرا
- DIST-MIT-ELEZZ ميت العز
- DIST-DAQADOS دقادوس
- PROJ-ADDED-LANDS-REGULARIZATION ملف توفيق أوضاع الأراضي المضافة

</details>
