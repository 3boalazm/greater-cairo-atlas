import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveGovernorateRelations, governorateParentLabel } from "@/lib/atlas/entity-relations";
import type { CodabGovernorateRelation } from "@/lib/atlas/entity-relations";

interface SeedEntity { code: string; entity_type: string }

const root = process.cwd();
const readJson = async <T>(relative: string): Promise<T> => JSON.parse(await readFile(path.join(root, relative), "utf8")) as T;

const codabPromise = readJson<CodabGovernorateRelation[]>("data/features/codab-relations.json");
const entitiesPromise = readFile(path.join(root, "data/seed/entities.csv"), "utf8").then((text) => {
  const lines = text.split(/\r?\n/u).filter((line) => line.trim());
  const header = lines[0]!.split(",");
  const codeAt = header.indexOf("code");
  const typeAt = header.indexOf("entity_type");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return { code: cells[codeAt] ?? "", entity_type: cells[typeAt] ?? "" } satisfies SeedEntity;
  });
});

const GOVERNORATE_ENTITY: Record<string, string> = {
  EG01: "AUTH-CAIRO-GOVERNORATE",
  EG21: "AUTH-GIZA-GOVERNORATE",
  EG14: "AUTH-QALYUBIA-GOVERNORATE",
};

describe("BATCH 12.4 — governorate parentage derived from CAPMAS adm1 codes", () => {
  it("records the governorate for each entity from the adm1 fields of its own units", async () => {
    const codab = await codabPromise;
    const governorateRows = codab.filter((row) => row.relation === "governorate");
    expect(governorateRows).toHaveLength(65);
    for (const row of governorateRows) {
      // The parent comes from the published pcode, never from geometry or a name match.
      expect(Object.keys(GOVERNORATE_ENTITY)).toContain(row.adm1_pcode);
      expect(row.adm1_name_ar.length).toBeGreaterThan(0);
      expect(row.evidence_code).toBe("EV-CODAB-ADMIN-2026");
      expect(row.license).toBe("CC BY-IGO");
      expect(row.pcodes.length).toBeGreaterThan(0);
    }
    // Spot-check the cases named in the brief.
    const obour = governorateRows.find((row) => row.entity_code === "CITY-OBOUR")!;
    expect(obour.adm1_pcode).toBe("EG14");
    expect(obour.adm1_name_ar).toBe("القليوبية");
    const giza = governorateRows.find((row) => row.entity_code === "CITY-6-OCTOBER")!;
    expect(giza.adm1_pcode).toBe("EG21");
  });

  it("derives located_in relations only to governorate entities that exist in the seed", async () => {
    const [codab, entities] = await Promise.all([codabPromise, entitiesPromise]);
    const result = deriveGovernorateRelations(codab, entities);
    expect(result.relations).toHaveLength(65);
    expect(result.unresolved).toHaveLength(0);
    for (const relation of result.relations) {
      expect(relation.predicate).toBe("located_in");
      expect(relation.object_code).toBe(GOVERNORATE_ENTITY[codab.find((row) => row.entity_code === relation.subject_code)!.adm1_pcode]);
      expect(relation.evidence_ref).toBe("EV-CODAB-ADMIN-2026");
      expect(relation.subject_code).not.toBe(relation.object_code);
    }
    const byTarget = new Map<string, number>();
    for (const relation of result.relations) byTarget.set(relation.object_code, (byTarget.get(relation.object_code) ?? 0) + 1);
    expect(Object.fromEntries(byTarget)).toEqual({
      "AUTH-CAIRO-GOVERNORATE": expect.any(Number),
      "AUTH-GIZA-GOVERNORATE": expect.any(Number),
      "AUTH-QALYUBIA-GOVERNORATE": expect.any(Number),
    });
    expect([...byTarget.values()].reduce((sum, value) => sum + value, 0)).toBe(65);
  });

  it("refuses to link when the governorate entity is missing from the seed", () => {
    const codab: CodabGovernorateRelation[] = [{
      entity_code: "CITY-OBOUR", relation: "governorate", adm1_pcode: "EG14", adm1_name_ar: "القليوبية",
      adm1_name_en: "Qalyubia", pcodes: ["EG1401"], evidence_code: "EV-CODAB-ADMIN-2026",
      source: "CAPMAS COD-AB 2017 (reviewed 2024)", license: "CC BY-IGO",
    }];
    const withoutGovernorate = deriveGovernorateRelations(codab, [{ code: "CITY-OBOUR", entity_type: "city" }]);
    expect(withoutGovernorate.relations).toHaveLength(0);
    expect(withoutGovernorate.unresolved[0]).toMatchObject({ entity_code: "CITY-OBOUR", adm1_pcode: "EG14" });

    // Unmapped pcode (outside the three governorates this atlas covers) also stays unresolved.
    const unmapped = deriveGovernorateRelations([{ ...codab[0]!, adm1_pcode: "EG99" }], [
      { code: "CITY-OBOUR", entity_type: "city" }, { code: "AUTH-CAIRO-GOVERNORATE", entity_type: "authority" },
    ]);
    expect(unmapped.relations).toHaveLength(0);
    expect(unmapped.unresolved[0]!.reason).toContain("no governorate entity is mapped");
  });

  it("keeps every derived relation traceable to a seeded fact, as the validator requires", async () => {
    const [relations, facts] = await Promise.all([
      readJson<Array<{ subject_code: string; predicate: string; object_code: string; evidence_ref: string | null }>>("data/seed/relations.json"),
      readJson<Array<{ entity_code: string; attribute: string; value: string; evidence_codes: string[] }>>("data/seed/facts.json"),
    ]);
    const governorateRelations = relations.filter((relation) => relation.predicate === "located_in" &&
      relation.object_code.endsWith("-GOVERNORATE"));
    expect(governorateRelations).toHaveLength(65);
    for (const relation of governorateRelations) {
      const fact = facts.find((item) => item.entity_code === relation.subject_code && item.attribute === "located_in" && item.value === relation.object_code);
      expect(fact, relation.subject_code).toBeDefined();
      expect(fact!.evidence_codes).toContain(relation.evidence_ref);
    }
    // Facts derived this way are candidates, never verified: the source is official but no fact-level
    // verification was performed, so nothing may claim `verified`.
    for (const relation of governorateRelations) {
      const fact = facts.find((item) => item.entity_code === relation.subject_code && item.attribute === "located_in" && item.value === relation.object_code)!;
      expect((fact as { verification_state?: string }).verification_state).toBe("candidate");
    }
  });

  it("renders the short simple-panel line", () => {
    expect(governorateParentLabel("محافظة الجيزة", "Giza Governorate", "ar")).toBe("يتبع: محافظة الجيزة");
    expect(governorateParentLabel("محافظة الجيزة", "Giza Governorate", "en")).toBe("Part of: Giza Governorate");
  });
});

describe("BATCH 12.4 — the relation reaches the panel, not just the seed file", () => {
  it("serves the governorate relation with its target entity from the static dataset", async () => {
    const { getStaticEntityRelations } = await import("@/lib/atlas/static-dataset");
    const obour = await getStaticEntityRelations("CITY-OBOUR");
    const relation = obour.find((item) => item.predicate === "located_in" && item.object_code.endsWith("-GOVERNORATE"));
    expect(relation).toBeDefined();
    expect(relation!.object_code).toBe("AUTH-QALYUBIA-GOVERNORATE");
    // The panel needs the target's names and type to render «يتبع: …» without a second lookup.
    expect(relation!.object?.name_ar).toBe("محافظة القليوبية");
    expect(relation!.object?.entity_type).toBe("authority");
    expect(relation!.evidence_ref).toBe("EV-CODAB-ADMIN-2026");

    const agouza = await getStaticEntityRelations("DIST-AGOUZA");
    expect(agouza.some((item) => item.object_code === "AUTH-GIZA-GOVERNORATE")).toBe(true);
  });

  it("does not attach a governorate to an entity that has no CAPMAS boundary", async () => {
    const { getStaticEntityRelations } = await import("@/lib/atlas/static-dataset");
    // AIRPORT-CAIRO has geometry but no CAPMAS boundary unit, so no governorate may be invented.
    const relations = await getStaticEntityRelations("AIRPORT-CAIRO");
    expect(relations.filter((item) => item.object_code.endsWith("-GOVERNORATE"))).toHaveLength(0);
  });
});
