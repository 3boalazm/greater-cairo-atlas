/** Codes only; database records are retained, never silently reconciled or deleted. */
export interface SeedDriftCodes {
  entities: string[];
  facts: string[];
  evidence: string[];
}
export type DriftQuery = (text: string, values: unknown[]) => Promise<Array<{ code: string }>>;
export async function getSeedDriftCodes(
  query: DriftQuery,
  seed: { entities: readonly { code: string }[]; facts: readonly { code: string }[]; evidence: readonly { code: string }[] },
): Promise<SeedDriftCodes> {
  const read = async (table: "entities" | "facts" | "evidence") =>
    (await query(`SELECT code FROM ${table} WHERE NOT (code = ANY($1::text[])) ORDER BY code`,
      [seed[table].map((row) => row.code)])).map((row) => row.code);
  return { entities: await read("entities"), facts: await read("facts"), evidence: await read("evidence") };
}
