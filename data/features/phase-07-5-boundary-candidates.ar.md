# PHASE 07.5 — تدقيق مرشحي حدود المدن والأحياء

## التغطية قبل/بعد حسب النوع

| النوع | الكيانات | حدود قبل | حدود بعد | بلا حدود بعد |
|---|---:|---:|---:|---:|
| `city` | 42 | 14 | 13 | 29 |
| `district` | 83 | 7 | 6 | 77 |

- التطبيع: NFKC/casefold; Arabic أ/إ/آ/ٱ→ا, ة→ه, ى→ي; remove حي/قسم/مدينة/منطقة/District/City and generic area words
- قاعدة القبول: exact normalized canonical/alias match; point covered or <=1km away (search radius <=2km); city 1-800km2, district 0.05-60km2; larger plausible same-name polygon can supersede a block; no guess on ties
- كل مسافة محسوبة بين النقطة الحالية للكيان ومضلع OSM (صفر إذا كانت النقطة داخله). `—` تعني أن الكيان لا يملك نقطة حالية؛ لذلك لا تُقبل هندسة تلقائيًا.

## المطابقات الحالية ومراجعة المرشحين المرفوضين

### `CITY-10TH-RAMADAN` — العاشر من رمضان / 10th of Ramadan
- النتيجة: مطابق؛ OSM/605783816؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/605783816 (v13): name=العاشر من رمضان / name:ar=العاشر من رمضان / name:en=10th of Ramadan; المسافة 0 م؛ المساحة 71.651 كم²؛ place=city, admin_level=8, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.
- OSM/way/544180702 (v4): name=الحى العاشر / name:ar=الحى العاشر / name:en=Buildings 86 Meter; المسافة 88356 م؛ المساحة 0.179 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: polygon falls outside entity-specific bbox guard; polygon is 88356 m from entity point; exceeds 1 km point-to-polygon guard; candidate also lies beyond the 2 km candidate search radius; area 0.179 km² is outside city range 1–800 km²; superseded by larger plausible same-name polygon (71.651 km²).

### `CITY-15-MAY` — 15 مايو / 15th of May City
- النتيجة: مطابق؛ OSM/1103679051؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/1103679051 (v5): name=مدينة الخامس عشر من مايو / name:ar=مدينة الخامس عشر من مايو / name:en=15th of May; المسافة 0 م؛ المساحة 72.266 كم²؛ place=city, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `CITY-BENHA` — بنها / Benha
- النتيجة: مطابق؛ OSM/739039585؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/739039585 (v17): name=مدينه بنها / name:ar=مدينه بنها / name:en=Banha City; المسافة 111 م؛ المساحة 5.968 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `CITY-BILBEIS` — بلبيس / Bilbeis
- النتيجة: مطابق؛ OSM/756158390؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/756158390 (v10): name=مدينة بلبيس / name:ar=مدينة بلبيس / name:en=Belbes City; المسافة 0 م؛ المساحة 42.476 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `CITY-CAIRO` — القاهرة / Cairo
- النتيجة: مطابق؛ OSM/4103336؛ explicit governorate relation override; show as Cairo Governorate.
- تسمية العرض المطلوبة: **حدود محافظة القاهرة**؛ المصدر relation/4103336 (مستوى محافظة)، وليس حدودًا لمدينة القاهرة.
- OSM/relation/4103336 (v27): name=القاهرة / name:ar=القاهرة / name:en=Cairo; المسافة 0 م؛ المساحة 2995.882 كم²؛ place=—, admin_level=4, landuse=—؛ source_kind=`administrative`. القرار/سبب الاستبعاد إن انطبق: accepted by explicit CITY-CAIRO governorate override; relation 4103336 is labeled as Cairo Governorate.
- OSM/relation/5466227 (v24): name=القاهرة / name:ar=القاهرة / name:en=Cairo; المسافة 0 م؛ المساحة 2992.003 كم²؛ place=city, admin_level=4, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: area 2992.003 km² is outside city range 1–800 km²; superseded by larger plausible same-name polygon (2995.882 km²).

### `CITY-MADINATY` — مدينتي / Madinaty
- النتيجة: مطابق؛ OSM/1103956339؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/1103956339 (v8): name=Madinaty / name:ar=مدينتي; المسافة 0 م؛ المساحة 37.835 كم²؛ place=city, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `CITY-NEW-CAIRO` — القاهرة الجديدة / New Cairo
- النتيجة: مطابق؛ OSM/498580491؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/498580491 (v58): name=مدينة القاهرة الجديدة / name:ar=مدينة القاهرة الجديدة / name:en=New Cairo City; المسافة 0 م؛ المساحة 379.758 كم²؛ place=city, admin_level=8, landuse=—؛ source_kind=`administrative`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.
- OSM/way/252475573 (v28): name=التجمع الأول / name:ar=التجمع الأول / name:en=First Settlement; المسافة 3136 م؛ المساحة 5.069 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: polygon is 3136 m from entity point; exceeds 1 km point-to-polygon guard; candidate also lies beyond the 2 km candidate search radius; superseded by larger plausible same-name polygon (379.758 km²).
- OSM/way/774635278 (v12): name=التجمع الخامس / name:ar=التجمع الخامس / name:en=Fifth Settlement; المسافة 3166 م؛ المساحة 10.066 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: polygon is 3166 m from entity point; exceeds 1 km point-to-polygon guard; candidate also lies beyond the 2 km candidate search radius; superseded by larger plausible same-name polygon (379.758 km²).

### `CITY-QAHA` — قها / Qaha
- النتيجة: مطابق؛ OSM/732374401؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/732374401 (v13): name=مدينه قها / name:ar=مدينه قها / name:en=Qaha City; المسافة 0 م؛ المساحة 12.913 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `CITY-QALYUB` — قليوب / Qalyub
- النتيجة: مطابق؛ OSM/730141764؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/730141764 (v25): name=مدينه قليوب / name:ar=مدينه قليوب / name:en=Qalyub City; المسافة 0 م؛ المساحة 19.846 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `CITY-QANATER` — القناطر / El Qanater
- النتيجة: مطابق؛ OSM/729636261؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/729636261 (v13): name=مدينه القناطر الخيريه / name:ar=مدينه القناطر الخيريه / name:en=Al Qanater Al Khaireia City; المسافة 0 م؛ المساحة 16.680 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `CITY-SHIBIN-ELQANATER` — شبين القناطر / Shibin El Qanater
- النتيجة: مطابق؛ OSM/736218125؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/736218125 (v13): name=مدينه شبين القناطر / name:ar=مدينه شبين القناطر / name:en=Shebin El Qanater City; المسافة 0 م؛ المساحة 10.756 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `CITY-TANTA` — طنطا / Tanta
- النتيجة: مطابق؛ OSM/3603506؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/relation/3603506 (v15): name=طنطا / name:en=Tanta; المسافة 0 م؛ المساحة 36.832 كم²؛ place=—, admin_level=8, landuse=—؛ source_kind=`administrative`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `CITY-TOUKH` — طوخ / Toukh
- النتيجة: مطابق؛ OSM/732390056؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/732390056 (v20): name=مدينه طوخ / name:ar=مدينه طوخ / name:en=Toukh City; المسافة 0 م؛ المساحة 6.077 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `DIST-BAHTIM` — بهتيم / Bahtim
- النتيجة: مطابق؛ OSM/741588124؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/741588124 (v10): name=بهتيم / name:ar=بهتيم / name:en=Bahtim; المسافة 0 م؛ المساحة 11.746 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `DIST-BULAQ-DAKROUR` — بولاق الدكرور / Bulaq al-Dakrour
- النتيجة: مطابق؛ OSM/727388925؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/727388925 (v13): name=بولاق الدكرور / name:ar=بولاق الدكرور / name:en=Bolak Al Dakrour; المسافة 184 م؛ المساحة 3.246 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `DIST-HELIOPOLIS` — مصر الجديدة / Heliopolis
- النتيجة: مطابق؛ OSM/1248798299؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/1248798299 (v5): name=قسم مصر الجديدة / name:ar=قسم مصر الجديدة / name:en=Heliopolis; المسافة 0 م؛ المساحة 8.563 كم²؛ place=quarter, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `DIST-MOHANDESSIN` — المهندسين / Mohandessin
- النتيجة: مطابق؛ OSM/723065148؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/723065148 (v15): name=المهندسين / name:ar=المهندسين / name:en=Al Mohandessin; المسافة 97 م؛ المساحة 1.258 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `DIST-MOSTOROD` — مسطرد / Mostorod
- النتيجة: مطابق؛ OSM/731002786؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/731002786 (v25): name=مسطرد / name:ar=مسطرد / name:en=Mustorod; المسافة 0 م؛ المساحة 8.809 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

### `DIST-SHARABIYA` — حي الشرابية / El Sharabiya District
- النتيجة: مطابق؛ OSM/707288091؛ automatically matched after name, distance, area, and source-priority guards.
- OSM/way/707288091 (v7): name=الشرابيه / name:ar=الشرابيه / name:en=Al Sharabeya; المسافة 858 م؛ المساحة 0.593 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: accepted: unique/selected plausible exact-name candidate within point guard.

## الكيانات بلا حدود مؤكدة — أفضل ثلاثة مرشحين بالاسم المطبع

### `CITY-6-OCTOBER` — 6 أكتوبر / 6th of October City
- نقطة الكيان: `[30.9409205, 29.9723458]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-ABU-SIMBEL` — أبو سمبل / Abu Simbel
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-AIN-SOKHNA` — العين السخنة / Ain Sokhna
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/1103680414 (v4): name=Ain Sokhna; المسافة —؛ المساحة 91.129 كم²؛ place=city, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `CITY-ALAMEIN` — العلمين / El Alamein
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-ALEXANDRIA` — إسكندرية / Alexandria
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-AUSIM` — أوسيم / Ausim
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/720891654 (v19): name=مدينة أوسيم / name:ar=مدينة أوسيم / name:en=Awseem City; المسافة —؛ المساحة 12.032 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `CITY-BADR` — بدر / Badr City
- نقطة الكيان: `[31.742824, 30.142806]`. الحالة: **unmatched**؛ no candidate passed every automatic acceptance guard.
- OSM/way/800386645 (v3): name=مدينه بدر / name:ar=مدينه بدر / name:en=Badr City; المسافة 107882 م؛ المساحة 19.477 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: polygon falls outside entity-specific bbox guard; polygon is 107882 m from entity point; exceeds 1 km point-to-polygon guard; candidate also lies beyond the 2 km candidate search radius.
- OSM/way/1073953480 (v3): name=بدر / name:ar=بدر / name:en=Badr / alt_name=مركز بدر; المسافة 108618 م؛ المساحة 3.528 كم²؛ place=town, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: polygon falls outside entity-specific bbox guard; polygon is 108618 m from entity point; exceeds 1 km point-to-polygon guard; candidate also lies beyond the 2 km candidate search radius.

### `CITY-FAYOUM` — الفيوم / Fayoum
- نقطة الكيان: `[30.8399651, 29.3074076]`. الحالة: **unmatched**؛ no candidate passed every automatic acceptance guard.
- OSM/relation/3726124 (v24): name=الفيوم / name:ar=الفيوم / name:en=Faiyum; المسافة 0 م؛ المساحة 5672.225 كم²؛ place=—, admin_level=4, landuse=—؛ source_kind=`administrative`. القرار/سبب الاستبعاد إن انطبق: polygon falls outside entity-specific bbox guard; area 5672.225 km² is outside city range 1–800 km².

### `CITY-GIZA` — الجيزة / Giza
- نقطة الكيان: `[31.2118063, 29.9870753]`. الحالة: **unmatched**؛ no candidate passed every automatic acceptance guard.
- OSM/relation/3824206 (v30): name=الجيزة / name:ar=الجيزة / name:en=Aj Jiza; المسافة 0 م؛ المساحة 38016.063 كم²؛ place=—, admin_level=4, landuse=—؛ source_kind=`administrative`. القرار/سبب الاستبعاد إن انطبق: polygon falls outside entity-specific bbox guard; area 38016.063 km² is outside city range 1–800 km².
- OSM/way/701014393 (v8): name=الجيزة / name:ar=الجيزة / name:en=El Giza; المسافة 11659 م؛ المساحة 0.484 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: polygon is 11659 m from entity point; exceeds 1 km point-to-polygon guard; candidate also lies beyond the 2 km candidate search radius; area 0.484 km² is outside city range 1–800 km².

### `CITY-HURGHADA` — الغردقة / Hurghada
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-KAFR-SHUKR` — كفر شكر / Kafr Shukr
- نقطة الكيان: `[31.2554096, 30.5525408]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-KERDASA` — كرداسة / Kerdasa
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/722860621 (v14): name=مدينه كرداسه / name:ar=مدينه كرداسه / name:en=Kerdasa City; المسافة —؛ المساحة 14.671 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `CITY-KHANKA` — الخانكة / El Khanka
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-MANSOURA` — المنصورة / Mansoura
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-MARSA-MATROUH` — مرسى مطروح / Marsa Matrouh
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/relation/3061826 (v25): name=مطروح / name:ar=مطروح / name:en=Matruh; المسافة —؛ المساحة 165248.428 كم²؛ place=—, admin_level=4, landuse=—؛ source_kind=`administrative`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked; area 165248.428 km² is outside city range 1–800 km².

### `CITY-MOSTAKBAL` — المستقبل سيتي / Mostakbal City
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/532811212 (v7): name=مدينة المستقبل / name:ar=مدينة المستقبل / name:en=Al Mustakbal City; المسافة —؛ المساحة 3.026 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.
- OSM/way/696939856 (v3): name=مدينة المستقبل / name:ar=مدينة المستقبل / name:en=Al Mostakbal City; المسافة —؛ المساحة 0.154 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked; area 0.154 km² is outside city range 1–800 km².

### `CITY-NEW-CAPITAL` — العاصمة الإدارية / New Administrative Capital
- نقطة الكيان: `[31.7549459, 30.023829]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-NEW-HELIOPOLIS` — هليوبوليس الجديدة / New Heliopolis
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-NEW-OBOUR` — العبور الجديدة / New Obour
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-NEW-OCTOBER` — أكتوبر الجديدة / New October
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-NEW-SPHINX` — سفنكس الجديدة / New Sphinx
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-NEW-ZAYED` — زايد الجديدة / New Zayed
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-OBOUR` — العبور / El Obour
- نقطة الكيان: `[31.450548, 30.1914]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-QENA` — قنا / Qena
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-REHAB` — الرحاب / El Rehab
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-SAFAGA` — سفاجا / Safaga
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-SHEIKH-ZAYED` — الشيخ زايد / Sheikh Zayed
- نقطة الكيان: `[30.9832235, 30.048347]`. الحالة: **unmatched**؛ no candidate passed every automatic acceptance guard.
- OSM/way/810567752 (v6): name=الشيخ زايد / name:ar=الشيخ زايد / name:en=Al Sheikh Zaid; المسافة 138275 م؛ المساحة 3.706 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: polygon falls outside entity-specific bbox guard; polygon is 138275 m from entity point; exceeds 1 km point-to-polygon guard; candidate also lies beyond the 2 km candidate search radius.

### `CITY-SHOROUK` — الشروق / El Shorouk
- نقطة الكيان: `[31.6295623, 30.1488541]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `CITY-SHUBRA-ELKHEIMA` — شبرا الخيمة / Shubra El Kheima
- نقطة الكيان: `[31.242218, 30.1285988]`. الحالة: **unmatched**؛ no candidate passed every automatic acceptance guard.
- OSM/way/731047816 (v7): name=مدينه شبرا الخيمه / name:ar=مدينه شبرا الخيمه / name:en=Shobra Al Khima City; المسافة 968 م؛ المساحة 1.820 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: area 1.820 km² is below entity-specific minimum 10 km²: the city is approximately 30 km²; the sole 1.82 km² place=neighbourhood residential polygon is a small sub-area, not city coverage.

### `DIST-ABBASSIA` — العباسية / Abbassia
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-ABDEEN` — عابدين / Abdeen
- نقطة الكيان: `[31.2488627, 30.044988]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-ABU-RAWASH` — أبو رواش / Abu Rawash
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-ABU-ZAABAL` — أبو زعبل / Abu Zaabal
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-AGOUZA` — العجوزة / Agouza
- نقطة الكيان: `[31.2127281, 30.0549435]`. الحالة: **unmatched**؛ no candidate passed every automatic acceptance guard.
- OSM/way/723745381 (v6): name=العجوزه / name:ar=العجوزه / name:en=Al Agouza; المسافة 0 م؛ المساحة 0.782 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: area 0.782 km² is below entity-specific minimum 2 km²: the sole 0.782 km² place=neighbourhood polygon is a locality-scale sub-area, not the full district; no larger named admin polygon is in the checked extracts.

### `DIST-AIN-SHAMS` — عين شمس / Ain Shams
- نقطة الكيان: `[31.3167491, 30.1304761]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-AMIRIYA` — حي الأميرية / El Amiriya District
- نقطة الكيان: `[31.283333, 30.1000001]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-AZBAKEYA` — حي الأزبكية / El Azbakeya District
- نقطة الكيان: `[31.2454725, 30.0538891]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-BAB-SHAREYA` — حي باب الشعرية / Bab El Shaareya District
- نقطة الكيان: `[31.2552829, 30.0584951]`. الحالة: **unmatched**؛ no candidate passed every automatic acceptance guard.
- OSM/way/709300098 (v10): name=باب الشعريه / name:ar=باب الشعريه / name:en=Bab Al Shairia; المسافة 391 م؛ المساحة 0.093 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: rejected: 0.09 km² place=neighbourhood is a block, not the full Bab al-Shaariya qism district.

### `DIST-BASATIN` — حي البساتين / El Basatin District
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/716699354 (v16): name=البساتين / name:ar=البساتين / name:en=Al Basatine; المسافة —؛ المساحة 3.873 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-BULAQ` — بولاق / Bulaq
- نقطة الكيان: `[31.2341778, 30.0591855]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-CAPITAL-GARDENS` — حدائق العاصمة / Capital Gardens
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-DAQADOS` — دقادوس / Daqados
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-DAR-ELSALAM` — حي دار السلام / Dar El Salam District
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/708231172 (v9): name=دار السلام / name:ar=دار السلام / name:en=Dar Al Salam; المسافة —؛ المساحة 2.037 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-DEGLA` — دجلة / Degla
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-DOKKI` — الدقي / Dokki
- نقطة الكيان: `[31.2125563, 30.0388955]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-DOWNTOWN` — وسط البلد / Downtown Cairo
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-EAST-SHUBRA-ELKHEIMA` — حي شرق شبرا الخيمة / East Shubra El Kheima District
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-FAISAL` — فيصل / Faisal
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/810845862 (v14): name=فيصل / name:ar=فيصل / name:en=Faisal; المسافة —؛ المساحة 212.320 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked; area 212.320 km² is outside district range 0.05–60 km².

### `DIST-FUSTAT` — الفسطاط / Fustat
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/990530550 (v3): name=الفسطاط / name:ar=الفسطاط / name:en=Fostat; المسافة —؛ المساحة 0.475 كم²؛ place=suburb, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-GARDEN-CITY` — جاردن سيتي / Garden City
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/707036948 (v9): name=جاردن سيتى / name:ar=جاردن سيتى / name:en=Garden City; المسافة —؛ المساحة 0.362 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-GHARB` — حي غرب / Gharb (West) District
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-GREEN-SARAYA` — السرايا الخضرا / Green Saraya
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-HADAEK-ASHGAR` — حدائق الأشجار / Hadaek El Ashgar
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-HADAEK-OCTOBER` — حدائق أكتوبر / Hadaek October
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-HADAYEK-AHRAM` — حدائق الأهرام / Hadayek El Ahram
- نقطة الكيان: `[31.1011113, 29.9693117]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-HADAYEK-QOBBA` — حدائق القبة / Hadayek El Qobba
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/703444827 (v8): name=حدائق القبه / name:ar=حدائق القبه / name:en=Hada'ek Al Kobba; المسافة —؛ المساحة 1.071 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-HARAM` — الهرم / Haram
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-HELWAN` — حلوان / Helwan
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-HUSSEIN-AZHAR` — الحسين والأزهر / El Hussein and Al Azhar
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/712064852 (v13): name=الأزهر / name:ar=الأزهر / name:en=El Azhar; المسافة —؛ المساحة 0.051 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-IMBABA` — إمبابة / Imbaba
- نقطة الكيان: `[31.215927, 30.088512]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-JURIAN` — جريان / Jurian
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-KATAMEYA` — القطامية / Katameya
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-KHALIFA` — حي الخليفة / El Khalifa District
- نقطة الكيان: `[31.2647255, 30.0113183]`. الحالة: **unmatched**؛ no candidate passed every automatic acceptance guard.
- OSM/way/711399636 (v6): name=الخليفه / name:ar=الخليفه / name:en=Al Khalifa; المسافة 1934 م؛ المساحة 0.062 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: polygon is 1934 m from entity point; exceeds 1 km point-to-polygon guard.

### `DIST-KHOSOUS` — الخصوص / El Khosous
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/729875378 (v12): name=الخصوص / name:ar=الخصوص / name:en=Al Khosous; المسافة —؛ المساحة 6.782 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-MAADI` — المعادي / Maadi
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-MAASARA` — حي المعصرة / El Maasara District
- نقطة الكيان: `[31.2912838, 29.9091281]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-MANIAL` — المنيل / Manial
- نقطة الكيان: `[31.2255698, 30.0209947]`. الحالة: **unmatched**؛ no candidate passed every automatic acceptance guard.
- OSM/way/846155421 (v3): name=حى الروضة / name:ar=حى الروضة / name:en=Al Rouda District; المسافة 81408 م؛ المساحة 3.269 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: polygon falls outside entity-specific bbox guard; polygon is 81408 m from entity point; exceeds 1 km point-to-polygon guard; candidate also lies beyond the 2 km candidate search radius.

### `DIST-MANSHEYET-BAKARY` — منشأة البكاري / Mansheyet El Bakary
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/701320188 (v19): name=منشيه البكرى / name:ar=منشيه البكرى / name:en=Mansheyet El Bakry; المسافة —؛ المساحة 3.206 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.
- OSM/way/727473214 (v7): name=مدينه منشاه البكارى / name:ar=مدينه منشاه البكارى / name:en=Monsha'et Al Bakary City; المسافة —؛ المساحة 2.422 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.
- OSM/way/765356373 (v2): name=منشيه البكري / name:ar=منشيه البكري / name:en=Mansheyah Al Bakry; المسافة —؛ المساحة 0.892 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-MANSHIYAT-NASSER` — حي منشأة ناصر / Manshiyat Nasser District
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/309248507 (v20): name=منشاه ناصر / name:ar=منشاه ناصر / name:en=Monsha'at Nasir; المسافة —؛ المساحة 1.002 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-MANSOURIYA` — المنصورية / El Mansouriya
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/711968070 (v5): name=المنصوريه / name:ar=المنصوريه / name:en=Al Mansuriyya; المسافة —؛ المساحة 0.447 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-MARG` — المرج / El Marg
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-MATARIYA` — المطرية / El Matariya
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-MERAJ` — المعراج / El Meraj
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/703100081 (v5): name=مدينة المعراج / name:ar=مدينة المعراج / name:en=Al Mearag City; المسافة —؛ المساحة 2.093 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-MIT-ELEZZ` — ميت العز / Mit El Ezz
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-MOKATTAM` — المقطم / Mokattam
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/714742689 (v15): name=المقطم / name:ar=المقطم / name:en=El Mukkatam; المسافة —؛ المساحة 5.690 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-MOUSKY` — حي الموسكي / El Mousky District
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-MUNIRA-GHARBIYA` — المنيرة الغربية / Al-Muneera Al-Gharbiya
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/740139776 (v11): name=المنيره الغربيه / name:ar=المنيره الغربيه / name:en=Western Al Mounira; المسافة —؛ المساحة 4.908 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-NARGES` — النرجس / El Narges
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/759863248 (v2): name=حى النرجس / name:ar=حى النرجس / name:en=El Narges District; المسافة —؛ المساحة 0.381 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.
- OSM/way/693534141 (v4): name=النرجس / name:ar=النرجس / name:en=El Narges; المسافة —؛ المساحة 0.022 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked; area 0.022 km² is outside district range 0.05–60 km².

### `DIST-NASR-CITY` — مدينة نصر / Nasr City
- نقطة الكيان: `[31.3422045, 30.0521177]`. الحالة: **unmatched**؛ no candidate passed every automatic acceptance guard.
- OSM/way/1249382787 (v11): name=مدينة نصر / name:ar=مدينة نصر / name:en=Nasr City; المسافة 0 م؛ المساحة 67.558 كم²؛ place=city, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: area 67.558 km² is outside district range 0.05–60 km².
- OSM/way/1249385211 (v5): name=ثان مدينة نصر / name:ar=ثان مدينة نصر / name:en=Qesm Than Madinet Nasr; المسافة 1434 م؛ المساحة 17.166 كم²؛ place=city, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: polygon is 1434 m from entity point; exceeds 1 km point-to-polygon guard.

### `DIST-NEW-MAADI` — المعادي الجديدة / New Maadi
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/777522265 (v5): name=المعادي الجديدة / name:ar=المعادي الجديدة / name:en=El Maadi El Gadida; المسافة —؛ المساحة 18.229 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-NOZHA` — النزهة / El Nozha
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/701289197 (v9): name=النزهه / name:ar=النزهه / name:en=Al Nozha; المسافة —؛ المساحة 2.114 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-OLD-CAIRO` — مصر القديمة / Old Cairo
- نقطة الكيان: `[31.229366, 30.0072008]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-OM-BAYOUMI` — أم بيومي / Om Bayoumi
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-OMRANIYA` — العمرانية / Omraneya
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-REMAYA` — الرماية / El Remaya
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-ROD-ELFARAG` — روض الفرج / Rod El Farag
- نقطة الكيان: `[31.2363328, 30.0732299]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-SAFT-ELLABAN` — صفط اللبن / Saft El Laban
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/98343218 (v22): name=صفط اللبن / name:ar=صفط اللبن / name:en=Saft Al Laban; المسافة —؛ المساحة 2.353 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-SAHEL` — الساحل / El Sahel
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/704920022 (v19): name=الساحل / name:ar=الساحل / name:en=El Sahel; المسافة —؛ المساحة 1.722 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-SALAM-1` — حي السلام أول / El Salam First District
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-SALAM-2` — حي السلام ثان / El Salam Second District
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-SAYEDA-ZEINAB` — السيدة زينب / Sayeda Zeinab
- نقطة الكيان: `[31.2404117, 30.0273241]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-SHUBRA` — شبرا / Shubra
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-SMART-VILLAGE` — القرية الذكية / Smart Village
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-SOUTH-GIZA` — جنوب الجيزة / South Giza
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/relation/3824206 (v30): name=الجيزة / name:ar=الجيزة / name:en=Aj Jiza; المسافة —؛ المساحة 38016.063 كم²؛ place=—, admin_level=4, landuse=—؛ source_kind=`administrative`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked; area 38016.063 km² is outside district range 0.05–60 km².
- OSM/way/701014393 (v8): name=الجيزة / name:ar=الجيزة / name:en=El Giza; المسافة —؛ المساحة 0.484 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-TAHRIR` — التحرير / Tahrir
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-TALBIYA` — الطالبية / Talbiya
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/725892870 (v4): name=الطالبيه / name:ar=الطالبيه / name:en=Al Talbia; المسافة —؛ المساحة 2.280 كم²؛ place=neighbourhood, admin_level=—, landuse=—؛ source_kind=`place`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-TEBBIN` — التبين / El Tebbin
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-TORA` — حي طره / Tora District
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-WAILY` — حي الوايلي / El Waily District
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-WARRAQ` — الوراق / El Warraq
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-WASAT` — حي وسط / Wasat (Central) District
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no existing entity point, so the 1 km proximity guard cannot be verified.
- OSM/way/685399399 (v3): name=The Spine - Madinaty / name:ar=وسط المدينة / name:en=The Spine - Madinaty; المسافة —؛ المساحة 0.776 كم²؛ place=neighbourhood, admin_level=—, landuse=residential؛ source_kind=`landuse`. القرار/سبب الاستبعاد إن انطبق: entity has no existing point geometry; proximity guard cannot be checked.

### `DIST-WEST-SHUBRA-ELKHEIMA` — حي غرب شبرا الخيمة / West Shubra El Kheima District
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-ZAHRAA-MAADI` — زهراء المعادي / Zahraa El Maadi
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-ZAMALEK` — الزمالك / Zamalek
- نقطة الكيان: `[31.2230269, 30.0503539]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-ZAWYA-HAMRA` — الزاوية الحمرا / El Zawya El Hamra
- نقطة الكيان: — (لا توجد نقطة كيان حالية). الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

### `DIST-ZEITOUN` — حي الزيتون / El Zeitoun District
- نقطة الكيان: `[31.3082194, 30.0998365]`. الحالة: **unmatched**؛ no exact normalized-name candidate polygon exists in the 07.4 extract.
- لا توجد مضلعات ذات اسم مطابق بعد التطبيع في ملف 07.4؛ الرفض: لا يوجد مرشح اسمي يمكن اختباره.

## أمثلة landuse=residential المطلوبة

- `CITY-MADINATY` (مدينتي): needs extract for named landuse=residential polygon; OSM way/relation IDs: `—`.
- `CITY-REHAB` (الرحاب): needs extract for named landuse=residential polygon; OSM way/relation IDs: `—`.
- `DIST-DEGLA` (دجلة): needs extract for named landuse=residential polygon; OSM way/relation IDs: `—`.
- `DIST-NARGES` (النرجس): present in 07.4 extract; OSM way/relation IDs: `693534141, 759863248`.

`source_kind=landuse` لا يُقبل إلا لمضلع سكني مسمى موجود في استخراج 07.4؛ غياب النقطة الحالية أو عدم اجتياز المساحة/المسافة يبقيه مرشحًا مرفوضًا ولا يبرر التخمين.
