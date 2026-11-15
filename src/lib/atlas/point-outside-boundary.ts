/**
 * BATCH 12.5 — client-safe presentation for the point-outside-boundary finding.
 *
 * This lives apart from `area-boundaries.ts` on purpose: that module reads files from `node:fs`, and a
 * client component importing it would drag Node built-ins into the browser bundle. Everything here is
 * data-in, string-out.
 */
export interface PointOutsideBoundaryFinding {
  entity_code: string;
  point: [number, number];
  distance_outside_m: number | null;
  inside_osm_boundary: boolean | null;
  round_coordinate: boolean;
}

/** The researcher-mode sentence, plus the measured distance so the claim is checkable. */
export function pointOutsideBoundaryNote(finding: PointOutsideBoundaryFinding, language: "ar" | "en"): string {
  const metres = finding.distance_outside_m === null ? null : Math.round(finding.distance_outside_m);
  if (language === "ar") {
    const base = "النقطة خارج الحدود الرسمية";
    if (finding.inside_osm_boundary === true) return `${base}: النقطة تقع داخل حدود OpenStreetMap لكن خارج حدود CAPMAS (فرق بين المصدرين، لا خطأ إحداثيات).`;
    if (metres !== null) return `${base}: تبعد نحو ${metres.toLocaleString("ar-EG")} متر عن حدود CAPMAS. لم تُنقل النقطة؛ تحتاج مراجعة بشرية.`;
    return `${base}. لم تُنقل النقطة؛ تحتاج مراجعة بشرية.`;
  }
  const base = "Point outside the official boundary";
  if (finding.inside_osm_boundary === true) return `${base}: the point is inside the OpenStreetMap boundary but outside CAPMAS, i.e. a source disagreement rather than a bad coordinate.`;
  if (metres !== null) return `${base}: about ${metres.toLocaleString("en-US")} m outside the CAPMAS boundary. The point was not moved; it needs human review.`;
  return `${base}. The point was not moved; it needs human review.`;
}
