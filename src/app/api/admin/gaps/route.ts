import { NextResponse } from "next/server";
import { resolveAdminIdentity } from "@/lib/admin/auth";
import { getAdminCounts } from "@/lib/admin/queries";
import { toApiErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BATCH 13 — GET /api/admin/gaps
 *
 * Every count here is measured. When a measurement is unavailable it is `null` and the UI shows «—»;
 * the endpoint never substitutes a zero it did not count.
 */
export async function GET(request: Request) {
  try {
    resolveAdminIdentity(request);
    const counts = await getAdminCounts();
    return NextResponse.json({
      ok: true,
      groups: [
        { kind: "open_conflicts", severity: "high", label_ar: "تعارضات مفتوحة", label_en: "Open conflicts", count: counts.open_conflicts,
          note_ar: "كيان واحد وسمة واحدة بقيمتين مختلفتين", note_en: "One entity, one attribute, two different values" },
        { kind: "single_source", severity: "medium", label_ar: "حقائق بمصدر واحد", label_en: "Facts with a single source", count: counts.facts_single_source,
          note_ar: "لا يمكن اعتبارها موثّقة بمصدر واحد", note_en: "A single source cannot carry a verified claim" },
        { kind: "without_evidence", severity: "high", label_ar: "حقائق بلا دليل", label_en: "Facts without evidence", count: counts.facts_without_evidence,
          note_ar: "أُدخلت دون رابط مصدر", note_en: "Entered with no source link" },
        { kind: "unknown_status", severity: "medium", label_ar: "حالات غير معروفة", label_en: "Unknown statuses", count: counts.unknown_statuses,
          note_ar: "لم يُتحقق من كونها قائمة أو قيد الإنشاء", note_en: "Not confirmed as open or under construction" },
        { kind: "without_geometry", severity: "medium", label_ar: "كيانات بلا هندسة", label_en: "Entities without geometry", count: counts.entities_without_geometry,
          note_ar: "لا تظهر على الخريطة", note_en: "They cannot appear on the map" },
        { kind: "unreviewed", severity: "low", label_ar: "حقائق بلا مراجعة", label_en: "Unreviewed facts", count: counts.unreviewed_facts,
          note_ar: "لم يطّلع عليها مراجع بعد", note_en: "No reviewer has looked at them yet" },
      ],
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
