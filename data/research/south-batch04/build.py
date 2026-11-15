#!/usr/bin/env python3
"""Build research/south-batch04 data files from the Gemini Deep Research output (2026-11-16).
Raw Gemini codes are remapped onto existing seed codes where the entity already exists."""
import csv, json, io

ACCESSED = "2026-11-15"
CHECKED = "2026-11-16"

# evidence ids whose URL was opened in a browser on 2026-11-16 and returned HTTP 200 with matching content
OK = set("""001 002 003 004 019 027 028 029 030 036 038 044 050 055 066 071 075 084 089 096 098 101 102 108
009 016 021 042 062 091 094 043 045 068 087 090 099 008 012 037 085 088 092 010 011 032 041 076 077 063 064""".split())
UNREACHABLE = set("039 040 054 047".split())  # nat.gov.eg error page; almasryalyoum blocked by browser policy

# Gemini code -> existing seed code (do NOT create duplicates)
REMAP = {
    "DIST-MISR-EL-QADIMA": "DIST-OLD-CAIRO",
    "DIST-SAYEDA-ZEINAB": "DIST-SAYEDA-ZEINAB",
    "ROAD-KATAMEYA-AIN-SOKHNA": "ROAD-AIN-SOKHNA",
    "LINE-BRT-RING-ROAD": "TRANSIT-BRT",
    "LINE-HSR-LINE-1": "TRANSIT-HSR-L1",
    "LINE-METRO-6": "TRANSIT-METRO-L6",
    "DIST-15-MAY": "CITY-15-MAY",
}
EXISTING = set(REMAP.values()) | {"BRIDGE-MONIB", "ROAD-EASTERN-DESERT", "ROAD-MOKATTAM-AXIS"}

NEW_ENTITIES = """code,name_ar,name_en,entity_type,sector,status,aliases,description
AUTH-CAIRO-SOUTH-ZONE,المنطقة الجنوبية لمحافظة القاهرة,Cairo Governorate Southern Zone,authority,SOUTH,operational,المنطقة الجنوبية,"التقسيم الإداري الجنوبي لمحافظة القاهرة ويضم 12 حيًا"
AUTH-NUCA-15-MAY,جهاز تنمية مدينة 15 مايو,15 May City Development Authority,authority,SOUTH,operational,جهاز مدينة 15 مايو,"جهاز تابع لهيئة المجتمعات العمرانية الجديدة مسؤول عن تنمية مدينة 15 مايو ومناطقها الصناعية"
ROAD-HASABALLAH-EL-KAFRAWY,محور حسب الله الكفراوي,Hasaballah El Kafrawy Axis,road,SOUTH,operational,محور الكفراوي,"محور يربط جنوب القاهرة (المعادي والأوتوستراد والدائري والأسمرات) بالمقطم وأحياء شرق القاهرة"
ROAD-YASSER-RIZK,محور ياسر رزق,Yasser Rizk Axis,road,SOUTH,operational,محور الهضبة,"محور يبدأ من تقاطعه مع محور سميرة موسى ويمر بالأسمرات وكورنيش المقطم الجديد حتى صلاح سالم والأوتوستراد"
ROAD-SAMIRA-MOUSSA,محور د. سميرة موسى,Dr. Samira Moussa Axis,road,SOUTH,operational,محور سميرة موسى,"محور يمر بمدخل الأسمرات ويربط أرض المعارض بالتجمع والقاهرة الجديدة"
ROAD-HADARAT-AXIS,محور الحضارات,El Hadarat Axis,road,SOUTH,operational,محور الحضارة,"محور يربط كورنيش النيل عند قرية الفواخير بمصر القديمة وعين الصيرة بهضبة المقطم"
ROAD-SALAH-SALEM-ALT,محور صلاح سالم البديل,Alternative Salah Salem Axis,road,SOUTH,partial,محور صلاح سالم الجديد,"محور بديل في نطاق مصر القديمة والخليفة بدأ تشغيله التجريبي في 2026"
ROAD-HELWAN-KORIMAT,طريق حلوان - الكريمات,Helwan-Korimat Road,road,SOUTH,operational,طريق حلوان الكريمات بني سويف الحر|طريق الأوتوستراد القاهرة الصف,"الطريق الرابط بين التبين وامتداد الأوتوستراد عبر الصف حتى الكريمات وطريق الصعيد الحر"
BRIDGE-SOUTH-HELWAN,كوبري جنوب حلوان على النيل,South Helwan Nile Bridge,bridge,SOUTH,under_construction,كوبري القطار السريع جنوب حلوان,"كوبري القطار الكهربائي السريع على النيل جنوب حلوان؛ أُعلن اكتمال إنشائه في 2025 والخط لم يُشغَّل بعد"
RAIL-HELWAN-HSR,محطة القاهرة بحلوان للقطار السريع,Cairo (Helwan) HSR Station,rail_station,SOUTH,under_construction,محطة القطار السريع بحلوان,"محطة للقطار الكهربائي السريع بحلوان تخدم حلوان و15 مايو وجنوب القاهرة شرق النيل"
LINE-HELWAN-OLD-RAIL,خط سكة حديد القاهرة - حلوان القديم,Old Cairo-Helwan Railway Line,transit_line,SOUTH,unknown,سكة حديد حلوان القديم,"خط تاريخي تحوّل مساره إلى الخط الأول للمترو عام 1987"
LANDMARK-NMEC,المتحف القومي للحضارة المصرية,National Museum of Egyptian Civilization (NMEC),landmark,SOUTH,operational,متحف الحضارة|NMEC,"متحف قومي بالفسطاط يطل على بحيرة عين الصيرة ويضم قاعة المومياوات الملكية"
LANDMARK-EIN-EL-SIRA,بحيرة عين الصيرة,Ein El Sira Lake,landmark,SOUTH,operational,عين الصيرة,"بحيرة ومتنزه مطور بمصر القديمة بجوار متحف الحضارة"
LANDMARK-MAGRA-EL-OYOUN,سور مجرى العيون,Magra El Oyoun Aqueduct,landmark,SOUTH,operational,مجرى العيون,"سور أثري في نطاق مصر القديمة والسيدة زينب"
LANDMARK-JAPANESE-GARDEN-HELWAN,الحديقة اليابانية بحلوان,Helwan Japanese Garden,landmark,SOUTH,operational,الحديقة اليابانية,"حديقة عامة على الطراز الآسيوي بحلوان أُنشئت عام 1919"
LANDMARK-ROKN-FAROUK,متحف ركن فاروق,Rokn Farouk Museum,landmark,SOUTH,operational,استراحة الملك فاروق بحلوان,"استراحة ملكية تحولت لمتحف على كورنيش النيل بحلوان"
LANDMARK-WADI-DEGLA,محمية وادي دجلة,Wadi Degla Protectorate,landmark,SOUTH,operational,وادي دجلة,"محمية طبيعية في جنوب القاهرة"
LANDMARK-FAWAKHIR-VILLAGE,قرية الفواخير,El Fawakhir Pottery Village,landmark,SOUTH,operational,قرية الفخار,"قرية حرفية للفخار بمصر القديمة على محور الحضارة"
LANDMARK-RELIGIOUS-COMPLEX,مجمع الأديان بمصر القديمة,Religious Complex (Old Cairo),landmark,SOUTH,operational,القاهرة القبطية,"منطقة أثرية تضم حصن بابليون والكنيسة المعلقة ومحيط جامع عمرو بن العاص"
LANDMARK-EL-TONSY-MARKET,سوق التونسي الحضاري,El Tonsy Market,landmark,SOUTH,operational,سوق التونسي الجديد,"سوق حضاري بديل بعزبة النصر في حي البساتين"
LANDMARK-15-MAY-SLAUGHTERHOUSE,مجزر 15 مايو,15 May Slaughterhouse,landmark,SOUTH,operational,مجزر 15 مايو نصف الآلي,"مجزر بمدينة 15 مايو يخدم أحياء المنطقة الجنوبية"
LANDMARK-HELWAN-IRON-STEEL,مجمع الحديد والصلب بحلوان,Helwan Iron and Steel Complex,landmark,SOUTH,unknown,شركة الحديد والصلب المصرية,"أول مجمع متكامل للحديد والصلب في مصر؛ الشركة تحت التصفية مع دراسة لإعادة تشغيل جزئي"
DIST-SHAQ-EL-THOABAN,المنطقة الصناعية شق الثعبان,Shaq El Thoaban Industrial Zone,district,SOUTH,operational,شق الثعبان,"منطقة صناعية للرخام والجرانيت بحي طره"
DIST-TEBBIN-INDUSTRIAL,المنطقة الصناعية بالتبين,El Tebbin Industrial Zone,district,SOUTH,operational,أرض البودرة|كفر العلو,"منطقة صناعية بحي التبين"
DIST-15-MAY-INDUSTRIAL,المنطقة الصناعية بمدينة 15 مايو,15 May City Industrial Zone,district,SOUTH,operational,المنطقة الصناعية الأولى والثانية بـ15 مايو,"منطقة صناعية داخل مدينة 15 مايو"
PROJ-FUSTAT-HILLS,مشروع حدائق تلال الفسطاط,Fustat Hills Park Project,project,SOUTH,under_construction,حدائق الفسطاط|تلال الفسطاط,"أكبر مسطح أخضر في القاهرة التاريخية بمصر القديمة؛ في مرحلة التجهيز للتشغيل"
PROJ-MAGRA-EL-OYOUN,مشروع تطوير سور مجرى العيون,Magra El Oyoun Redevelopment Project,project,SOUTH,under_construction,تطوير منطقة المدابغ,"مشروع تطوير عمراني بعد إزالة المدابغ والجيارة والجباسة"
PROJ-RAWDAT-EL-SAYEDA,مشروع روضة السيدة,Rawdat El Sayeda Project,project,SOUTH,partial,تل العقارب|روضة السيدة 2,"مشروع إسكان بديل بالسيدة زينب اكتملت مرحلته الأولى وتجري المرحلة الثانية"
PROJ-ASMARAT,مشروع حي الأسمرات,El Asmarat Housing Project,project,SOUTH,operational,مدينة الأسمرات,"مجتمع سكني بديل للمناطق غير الآمنة بالمقطم في ثلاث مراحل"
PROJ-EL-KHAYALA,مشروع إسكان أرض الخيالة,El Khayala Housing Project,project,SOUTH,operational,أرض الخيالة,"مشروع إسكان بديل في جنوب القاهرة"
PROJ-ZOHOUR-15-MAY,مشروع زهور 15 مايو,Zohour 15 May Housing Project,project,SOUTH,under_construction,زهور مايو,"مشروع سكن بديل بمدينة 15 مايو"
"""

# (gemini_code, attribute_key, value, unit, status_as_of, gemini_state, evidence_no)
F = [
("BRIDGE-MONIB","operational_status","operational","","2026-01-15","single_source","011"),
("BRIDGE-MONIB","lanes_per_direction","8","حارة/اتجاه","2026-01-15","single_source","011"),
("BRIDGE-MONIB","previous_lanes_per_direction","4","حارة/اتجاه","2021-06-04","verified","009"),
("BRIDGE-MONIB","ring_road_phase1_context","ضمن المرحلة الأولى لتوسعة الطريق الدائري (المريوطية/المنيب/الأوتوستراد)","","","verified","012"),
("BRIDGE-MONIB","adjacent_hub","موقف المنيب ونزلات المعادي والمريوطية أسفل الكوبري","","","verified","013"),
("ROAD-EASTERN-DESERT","operational_status","operational","","","verified","019"),
("ROAD-EASTERN-DESERT","official_corridor_identity","محور الصعيد شرق النيل (طريق بني سويف الكريمات الحر) وليس طريق السويس أو العين السخنة","","","verified","014"),
("ROAD-EASTERN-DESERT","southern_gateway","بوابات الكريمات بدائرة الصف","","","verified","017"),
("ROAD-EASTERN-DESERT","parallel_corridor_note","تمييز رسمي بين طريق الجيش والطريق الصحراوي الشرقي القديم","","","verified","018"),
("ROAD-MOKATTAM-AXIS","operational_status","operational","","2022-10-14","verified","024"),
("ROAD-MOKATTAM-AXIS","official_naming_resolution","تسمية شائعة لمنظومة محاور المقطم؛ أبرزها رسميًا محور ياسر رزق مع محوري حسب الله الكفراوي وسميرة موسى","","2022-09-09","verified","023"),
("AUTH-CAIRO-SOUTH-ZONE","district_count","12","حي","","verified","001"),
("AUTH-CAIRO-SOUTH-ZONE","constituent_districts","طرة، المعصرة، حلوان، 15 مايو، التبين، المعادي، البساتين، المقطم، مصر القديمة، دار السلام، الخليفة، السيدة زينب","","","verified","004"),
("AUTH-NUCA-15-MAY","parent_agency","هيئة المجتمعات العمرانية الجديدة","","","verified","006"),
("DIST-MISR-EL-QADIMA","contained_areas","قرية الفواخير ومحور الحضارة بكورنيش النيل","","","verified","038"),
("DIST-MISR-EL-QADIMA","contained_areas_redevelopment","منطقتا الجيارة والجباسة ومحيط سور مجرى العيون","","","verified","089"),
("DIST-SAYEDA-ZEINAB","administrative_zone","المنطقة الجنوبية لمحافظة القاهرة","","","verified","004"),
("ROAD-HASABALLAH-EL-KAFRAWY","route","يربط جنوب القاهرة (المعادي) بأحياء شرق القاهرة","","2022-02-25","verified","025"),
("ROAD-HASABALLAH-EL-KAFRAWY","length","17","كم","2022-11-22","single_source","032"),
("ROAD-HASABALLAH-EL-KAFRAWY","lanes_per_direction","4-7","حارة/اتجاه","2022-11-22","single_source","032"),
("ROAD-HASABALLAH-EL-KAFRAWY","lanes_per_direction","4-8","حارة/اتجاه","","single_source","034"),
("ROAD-HASABALLAH-EL-KAFRAWY","western_extension","محور 3 يوليو امتداد محور حسب الله الكفراوي","","","verified","035"),
("ROAD-YASSER-RIZK","route","من تقاطعه مع محور سميرة موسى حتى شارع صلاح سالم والأوتوستراد","","","verified","102"),
("ROAD-YASSER-RIZK","length","7","كم","","verified","027"),
("ROAD-YASSER-RIZK","length","9","كم","","verified","102"),
("ROAD-YASSER-RIZK","lanes_per_direction","5","حارة/اتجاه","","verified","102"),
("ROAD-YASSER-RIZK","hadarat_connection","يتصل بمحور ومتحف الحضارات عبر كوبري طه حسين","","","verified","028"),
("ROAD-SAMIRA-MOUSSA","route","يربط أرض المعارض والعاشر بالتجمع ويمر بمدخل الأسمرات","","","verified","108"),
("ROAD-SAMIRA-MOUSSA","length","10","كم","","single_source","109"),
("ROAD-SAMIRA-MOUSSA","lanes_per_direction","5","حارة/اتجاه","","single_source","109"),
("ROAD-HADARAT-AXIS","route","يربط هضبة المقطم بكورنيش النيل ويسهل وصول المعادي وحلوان والمقطم","","2022-10-14","verified","024"),
("ROAD-HADARAT-AXIS","corniche_segment","يتصل بكورنيش النيل عند قرية الفواخير بمصر القديمة","","","verified","038"),
("ROAD-SALAH-SALEM-ALT","operational_status","partial","","","verified","036"),
("ROAD-SALAH-SALEM-ALT","status_note","بدء التشغيل التجريبي وربطه بمحور الحضارات ومصر القديمة","","","verified","036"),
("ROAD-KATAMEYA-AIN-SOKHNA","intersection","يتقاطع مع وصلة أم القمر بكوبري علوي","","2021-10-08","verified","021"),
("ROAD-HELWAN-KORIMAT","south_cairo_connection","يربط التبين وطريق الصعيد الحر بحلوان والمعادي عبر الأوتوستراد","","","verified","019"),
("ROAD-HELWAN-KORIMAT","alt_name","طريق الأوتوستراد القاهرة / الصف","","","verified","020"),
("BRIDGE-SOUTH-HELWAN","length","2.520","كم","","verified","039"),
("BRIDGE-SOUTH-HELWAN","length","9.100","كم","","verified","040"),
("BRIDGE-SOUTH-HELWAN","route","من طريق التبين إلى طريق القاهرة/أسوان الزراعي","","","verified","039"),
("BRIDGE-SOUTH-HELWAN","construction_completed_announced","2025-08-17","","2025-08-17","single_source","041"),
("LINE-BRT-RING-ROAD","phase1_trial_start","2025-06-02","","2025-06-02","verified","044"),
("LINE-BRT-RING-ROAD","phase2_launch_date","2026-09-26","","2026-09-24","verified","043"),
("LINE-BRT-RING-ROAD","phase2_scope","يمتد بمرحلتيه من تقاطع الإسكندرية الزراعي حتى محطة صن كابيتال","","2026-09-25","verified","042"),
("LINE-BRT-RING-ROAD","phase2_stations_count","16","محطة","","verified","045"),
("LINE-BRT-RING-ROAD","phase2_stations_pending","3 محطات مؤجلة: زهراء المعادي والأوتوستراد والمنصورية","","2026-09-27","single_source","046"),
("LINE-BRT-RING-ROAD","total_length_phases_1_2","75","كم","","single_source","049"),
("LINE-BRT-RING-ROAD","total_stations_phases_1_2","30","محطة","","single_source","049"),
("LINE-BRT-RING-ROAD","mokattam_extension","مد مسار الإسكندرية الزراعي إلى محطة المقطم","","2026-11-15","single_source","048"),
("LINE-BRT-RING-ROAD","operating_hours","05:00-01:00","","2026-11-15","single_source","048"),
("LINE-BRT-RING-ROAD","metro_line1_interchange","الزهراء والمرج","","2026-09-24","verified","043"),
("LINE-HSR-LINE-1","south_cairo_alignment","يتقاطع مع الأوتوستراد بجوار مطار حلوان الحربي","","","verified","050"),
("LINE-METRO-6","planning_status","جارٍ دراسته بالهيئة القومية للأنفاق","","","verified","054"),
("LINE-METRO-6","route","من الخصوص إلى المعادي الجديدة ثم القاهرة الجديدة","","","verified","055"),
("LINE-HELWAN-OLD-RAIL","opening_year","1872","سنة","","single_source","057"),
("LINE-HELWAN-OLD-RAIL","metro_conversion_year","1987","سنة","","single_source","057"),
("RAIL-HELWAN-HSR","service_area","حلوان و15 مايو وجنوب القاهرة شرق النيل","","","single_source","052"),
("RAIL-HELWAN-HSR","ministerial_inspection","تفقد وزير النقل محطة القاهرة بحلوان","","","single_source","053"),
("LANDMARK-NMEC","address","طريق الفسطاط، عين الصيرة، القاهرة","","","verified","059"),
("LANDMARK-NMEC","royal_mummies_parade_date","2021-04-03","","","verified","061"),
("LANDMARK-NMEC","location_context","قرب حصن بابليون ويطل على بحيرة عين الصيرة","","","verified","062"),
("LANDMARK-EIN-EL-SIRA","redevelopment_status","بحيرة مطورة ومتنزه حضاري بمحيط حدائق الفسطاط وسور مجرى العيون","","","verified","063"),
("LANDMARK-MAGRA-EL-OYOUN","heritage_context","سور أثري تحيط به منطقة تطوير بعد إزالة المدابغ","","","verified","063"),
("LANDMARK-JAPANESE-GARDEN-HELWAN","established_year","1919","سنة","","verified","065"),
("LANDMARK-JAPANESE-GARDEN-HELWAN","area_feddans","10","فدان","","verified","065"),
("LANDMARK-JAPANESE-GARDEN-HELWAN","managing_body","الحدائق المتخصصة بمحافظة القاهرة","","","verified","066"),
("LANDMARK-ROKN-FAROUK","opened_date","1942-09-05","","","verified","065"),
("LANDMARK-ROKN-FAROUK","area_sqm","11600","م2","","verified","065"),
("LANDMARK-WADI-DEGLA","official_recognition","محمية طبيعية مذكورة في ملف حصاد 2025","","","verified","068"),
("LANDMARK-FAWAKHIR-VILLAGE","location","مصر القديمة على محور الحضارة بكورنيش النيل","","","verified","038"),
("LANDMARK-RELIGIOUS-COMPLEX","nearest_metro_station","مار جرجس","","","verified","070"),
("LANDMARK-EL-TONSY-MARKET","location","عزبة النصر بحي البساتين","","","verified","071"),
("LANDMARK-15-MAY-SLAUGHTERHOUSE","service_scope","يخدم أحياء المنطقة الجنوبية لمحافظة القاهرة","","","verified","001"),
("LANDMARK-HELWAN-IRON-STEEL","land_reuse_plan_2021","تحويل أراضي المصنع إلى نشاط عقاري وفق تصريح وزير قطاع الأعمال","","","verified","075"),
("LANDMARK-HELWAN-IRON-STEEL","partial_restart_study","دراسة حكومية لإعادة تشغيل جزئي وإقامة مصنع حديد على 300 فدان","","2025-08-25","single_source","076"),
("LANDMARK-HELWAN-IRON-STEEL","liquidation_status","الشركة تحت التصفية (ميزانية 30 يونيو 2026)","","2026-06-30","single_source","077"),
("DIST-SHAQ-EL-THOABAN","official_designation","المنطقة الصناعية شق الثعبان وبدر الليثي والشيماء بحي طره","","","verified","078"),
("DIST-SHAQ-EL-THOABAN","development_model","تطوير وطرح بنظام BOOT","","","verified","079"),
("DIST-TEBBIN-INDUSTRIAL","official_designation","المنطقة الصناعية التبين (أرض البودرة/كفر العلو)","","","verified","080"),
("DIST-15-MAY-INDUSTRIAL","area_feddans","376","فدان","","verified","006"),
("DIST-15-MAY-INDUSTRIAL","existing_factories_total","211","مصنع","","verified","006"),
("PROJ-FUSTAT-HILLS","area_feddans","500","فدان","","verified","084"),
("PROJ-FUSTAT-HILLS","pm_inspection_date","2026-06-21","","2026-06-21","verified","085"),
("PROJ-FUSTAT-HILLS","latest_followup_date","2026-08-26","","2026-08-26","verified","087"),
("PROJ-MAGRA-EL-OYOUN","cleared_area_feddans","95","فدان","","verified","089"),
("PROJ-MAGRA-EL-OYOUN","phase2_inspection_date","2023-03-12","","2023-03-12","verified","088"),
("PROJ-MAGRA-EL-OYOUN","latest_followup_date","2026-03-24","","2026-03-24","verified","090"),
("PROJ-RAWDAT-EL-SAYEDA","phase1_residential_units","816","وحدة","","verified","091"),
("PROJ-RAWDAT-EL-SAYEDA","phase2_target_families","386","أسرة","","verified","092"),
("PROJ-ASMARAT","phase3_residential_units","7298","وحدة","","verified","094"),
("PROJ-ASMARAT","services_followup","متابعة توافر الخدمات بمدينة الأسمرات","","","verified","096"),
("PROJ-EL-KHAYALA","buildings_count","42","عمارة","","verified","097"),
("PROJ-EL-KHAYALA","governor_inspection","جولة محافظ القاهرة بمشروع إسكان أرض الخيالة","","","verified","098"),
("PROJ-ZOHOUR-15-MAY","residential_units","1008","وحدة","","verified","099"),
("PROJ-ZOHOUR-15-MAY","buildings_count","42","عمارة","","verified","099"),
]

def main(out):
    ev = {}
    for line in open(f"{out}/evidence_raw.tsv", encoding="utf-8"):
        ref, typ, date, url, pub, title = line.rstrip("\n").split("\t")
        n = ref[-3:]
        chk = "ok" if n in OK else ("unreachable" if n in UNREACHABLE else "unchecked")
        ev[n] = dict(evidence_ref=ref, source_url=url, publisher=pub, title=title,
                     note=f"Gemini Deep Research batch 04; url_check={chk} ({CHECKED})",
                     source_type=typ, published_date=date or None, accessed_date=ACCESSED, url_check=chk)
    facts, used = [], set()
    for code, key, val, unit, asof, state, n in F:
        e = ev[n]
        # verified only for an official source whose URL we actually opened
        if state == "verified" and not (e["source_type"] == "official" and e["url_check"] == "ok"):
            state = "single_source"
        if e["source_type"] != "official" and state == "verified":
            state = "single_source"
        facts.append(dict(entity_code=REMAP.get(code, code), attribute_key=key, value=val,
                          unit=unit or None, status_as_of=asof or None,
                          verification_state=state, evidence_ref=e["evidence_ref"]))
        used.add(n)
    evidence = [ev[n] for n in sorted(used)]
    ents = list(csv.DictReader(io.StringIO(NEW_ENTITIES)))
    codes = {e["code"] for e in ents} | EXISTING
    bad = [f["entity_code"] for f in facts if f["entity_code"] not in codes]
    assert not bad, bad
    with open(f"{out}/entities.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(ents[0].keys())); w.writeheader(); w.writerows(ents)
    json.dump(facts, open(f"{out}/facts.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(evidence, open(f"{out}/evidence.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    status = [
        dict(entity_code="BRIDGE-MONIB", **{"from": "unknown", "to": "operational"}, basis=["EV-S4-011", "EV-S4-012"],
             caveat="latest explicit official mention is construction-era; 8-lane operation from news"),
        dict(entity_code="ROAD-EASTERN-DESERT", **{"from": "unknown", "to": "operational"}, basis=["EV-S4-014", "EV-S4-019"]),
        dict(entity_code="ROAD-MOKATTAM-AXIS", **{"from": "unknown", "to": "operational"}, basis=["EV-S4-023", "EV-S4-024"],
             caveat="informal umbrella name; official axes are Yasser Rizk / Kafrawy / Samira Moussa"),
    ]
    json.dump(status, open(f"{out}/status_changes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(REMAP, open(f"{out}/code_remap.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from collections import Counter
    print(len(ents), "new entities;", len(facts), "facts;", len(evidence), "evidence")
    print(Counter(f["verification_state"] for f in facts), Counter(e["url_check"] for e in evidence))

if __name__ == "__main__":
    import sys; main(sys.argv[1])
