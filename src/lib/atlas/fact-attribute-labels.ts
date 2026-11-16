import { GENERATED_FACT_ATTRIBUTE_LABELS } from "@/lib/atlas/fact-attribute-labels.generated";
import ARABIC_ATTRIBUTE_LABELS from "../../../data/research/labels/attribute_labels_ar.json";

type Pair = { ar: string; en: string };
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
