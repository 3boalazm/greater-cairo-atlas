import type { StaticAtlasDataset } from "@/lib/atlas/static-dataset";
import { serializeCsv } from "@/lib/atlas/static-dataset";

export const CSV_TABLES = ["entities", "facts", "evidence", "fact_evidence"] as const;
export type CsvTable = (typeof CSV_TABLES)[number];

export const CSV_HEADERS: Record<CsvTable, readonly string[]> = {
  entities: ["code","name_ar","name_en","entity_type","sector","status","aliases","description"],
  facts: ["code","entity_code","attribute","value","unit","valid_as_of","valid_as_of_precision","verification_state","evidence_codes","notes"],
  evidence: ["code","title","url","publisher","source_type","published_date","published_date_precision","accessed_date","notes"],
  fact_evidence: ["fact_code","evidence_code"],
};

export function csvForTable(dataset: StaticAtlasDataset, table: CsvTable): string {
  const rows = table === "fact_evidence" ? dataset.factEvidence : dataset[table];
  return serializeCsv(CSV_HEADERS[table], rows as unknown as Array<Record<string, unknown>>);
}

export function exportResponseHeaders(metadata: {
  dataset_version: string;
  generated_at: string;
  import_checksum: string;
}, contentType: string, filename?: string): HeadersInit {
  return {
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    "Content-Type": contentType,
    "X-Atlas-Dataset-Version": metadata.dataset_version,
    "X-Atlas-Git-SHA": metadata.dataset_version.split("+")[0] ?? "unknown",
    "X-Atlas-Import-Checksum": metadata.import_checksum,
    "X-Atlas-Generated-At": metadata.generated_at,
    "X-Atlas-Geometry-Attribution": "OpenStreetMap contributors; ODbL 1.0",
    "X-Atlas-Research-Data-License": "Not specified in repository; owner decision required",
    ...(filename ? { "Content-Disposition": `attachment; filename=\"${filename}\"` } : {}),
  };
}
