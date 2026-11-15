import { GENERATED_FACT_ATTRIBUTE_LABELS } from "@/lib/atlas/fact-attribute-labels.generated";
import ARABIC_ATTRIBUTE_LABELS from "../../../data/research/labels/attribute_labels_ar.json";

export type LabelLanguage = "ar" | "en";
type Pair = { ar: string; en: string };

export const ENTITY_TYPE_LABELS: Record<string, Pair> = {
  city: { ar: "مدينة", en: "City" }, district: { ar: "حي", en: "District" }, neighborhood: { ar: "حيّ/جوار", en: "Neighborhood" },
  road: { ar: "طريق", en: "Road" }, bridge: { ar: "كوبري", en: "Bridge" }, interchange: { ar: "تقاطع", en: "Interchange" }, tunnel: { ar: "نفق", en: "Tunnel" },
  transit_line: { ar: "خط نقل", en: "Transit line" }, transit_stop: { ar: "محطة نقل", en: "Transit stop" }, rail_station: { ar: "محطة سكك حديدية", en: "Rail station" },
  airport: { ar: "مطار", en: "Airport" }, project: { ar: "مشروع", en: "Project" }, authority: { ar: "جهة/هيئة", en: "Authority" }, landmark: { ar: "مَعلم", en: "Landmark" },
  facility: { ar: "منشأة", en: "Facility" }, waterway: { ar: "مجرى مائي", en: "Waterway" }, utility: { ar: "مرفق", en: "Utility" },
  transit_station: { ar: "محطة نقل", en: "Transit station" }, bridge_interchange: { ar: "تقاطع كوبري", en: "Bridge interchange" },
  public_facility: { ar: "مرفق عام", en: "Public facility" }, development_zone: { ar: "منطقة تنمية", en: "Development zone" },
};
export const SECTOR_LABELS: Record<string, Pair> = {
  NORTH: { ar: "الشمال", en: "North" }, EAST: { ar: "الشرق", en: "East" }, SOUTH: { ar: "الجنوب", en: "South" },
  WEST: { ar: "الغرب", en: "West" }, CENTRAL: { ar: "الوسط", en: "Central" }, REGIONAL: { ar: "نقاط ربط إقليمية", en: "Regional connection points" },
};
const HUMAN_ARABIC_ATTRIBUTE_LABELS = ARABIC_ATTRIBUTE_LABELS as Record<string, string>;
export const FACT_ATTRIBUTE_LABELS: Record<string, Pair> = {
  ...Object.fromEntries(Object.entries(GENERATED_FACT_ATTRIBUTE_LABELS).map(([key, pair]) => [key, {
    ...pair, ar: HUMAN_ARABIC_ATTRIBUTE_LABELS[key] ?? pair.ar,
  }])),

  operational_status: { ar: "حالة التشغيل", en: "Operational status" }, status: { ar: "الحالة", en: "Status" }, line_membership: { ar: "الانتماء إلى الخط", en: "Line membership" },
  line_order: { ar: "ترتيب المحطة على الخط", en: "Line order" }, osm_node_id: { ar: "معرّف عقدة OSM", en: "OSM node ID" }, osm_way_id: { ar: "معرّف طريق OSM", en: "OSM way ID" },
  length_km: { ar: "الطول (كم)", en: "Length (km)" }, cost: { ar: "التكلفة", en: "Cost" }, capacity: { ar: "السعة", en: "Capacity" }, opening_date: { ar: "تاريخ الافتتاح", en: "Opening date" },
  construction_start: { ar: "بدء الإنشاء", en: "Construction start" }, trial_operation_start: { ar: "بدء التشغيل التجريبي", en: "Trial operation start" }, served_by: { ar: "يخدمه", en: "Served by" },
  route_length_km: { ar: "طول المسار (كم)", en: "Route length (km)" }, stations_count: { ar: "عدد المحطات", en: "Station count" },
};
export const SOURCE_TYPE_LABELS: Record<string, Pair> = {
  official: { ar: "رسمي", en: "Official" }, news: { ar: "أخبار", en: "News" }, secondary: { ar: "ثانوي", en: "Secondary" },
  dataset: { ar: "مجموعة بيانات", en: "Dataset" }, map: { ar: "خريطة", en: "Map" }, pdf: { ar: "ملف PDF", en: "PDF" },
};
export const VERIFICATION_LABELS: Record<string, Pair> = {
  candidate: { ar: "مرشح", en: "Candidate" }, single_source: { ar: "مصدر واحد", en: "Single source" }, corroborated: { ar: "مؤيد بمصادر", en: "Corroborated" },
  verified: { ar: "موثّق", en: "Verified" }, disputed: { ar: "متنازع عليه", en: "Disputed" }, rejected: { ar: "مرفوض", en: "Rejected" }, superseded: { ar: "مستبدل", en: "Superseded" },
};
export const SIMPLE_STATUS_LABELS: Record<string, Pair> = {
  operational: { ar: "يعمل", en: "Operating" }, partial: { ar: "يعمل جزئيًا", en: "Partly operating" }, under_construction: { ar: "تحت الإنشاء", en: "Under construction" },
  planned: { ar: "مخطط", en: "Planned" }, approved_planned: { ar: "مخطط", en: "Planned" }, unknown: { ar: "غير محدد", en: "Not specified" },
};
export const STATUS_LABELS: Record<string, Pair> = {
  operational: { ar: "يعمل", en: "Operational" }, partial: { ar: "يعمل جزئيًا", en: "Partial" }, under_construction: { ar: "قيد الإنشاء", en: "Under construction" },
  planned: { ar: "مخطط", en: "Planned" }, approved_planned: { ar: "مخطط ومعتمد", en: "Approved planned" }, unknown: { ar: "غير معلوم", en: "Unknown" },
};

export function translateLabel(dictionary: Record<string, Pair>, key: string, language: LabelLanguage): string {
  return dictionary[key]?.[language] ?? key;
}
export function quickFactSourceCountLabel(count: number, language: LabelLanguage): string | null {
  if (!Number.isInteger(count) || count <= 1) return null;
  if (language === "en") return `${count} sources`;
  if (count === 2) return "مصدران";
  return count <= 10 ? `${count} مصادر` : `${count} مصدرًا`;
}

export function stationDisplayName(code: string, name: string): string {
  return code === "STOP-6-OCTOBER-INTERCHANGE" ? "محطة 6 أكتوبر (مونوريل غرب النيل)" : name;
}
