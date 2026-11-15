import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  disambiguationNote, duplicateVisibleLabels, entityListLabel, entityQualifier, entityTypeLabel,
  groupByRegionalScope, isGreaterCairoCity, isRegionalLink, normalizeEntityName, regionalLinkLabel,
} from "@/lib/atlas/entity-presentation";

interface SeedEntity {
  code: string; name_ar: string; name_en: string; entity_type: string; sector: string; aliases: string;
}

const seedPath = path.resolve(process.cwd(), "data/seed/entities.csv");

function parseCsv(text: string): SeedEntity[] {
  const lines = text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const header = lines[0]!.split(",");
  const index: Record<string, number> = Object.fromEntries(header.map((name, position) => [name, position]));
  return lines.slice(1).map((line) => {
    // The seed uses quoting only for embedded separators; a simple split is enough for the columns used here.
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (const char of line) {
      if (char === '"') { quoted = !quoted; continue; }
      if (char === "," && !quoted) { cells.push(current); current = ""; continue; }
      current += char;
    }
    cells.push(current);
    const at = (name: string) => cells[index[name]!] ?? "";
    return {
      code: at("code"), name_ar: at("name_ar"), name_en: at("name_en"),
      entity_type: at("entity_type"), sector: at("sector"), aliases: at("aliases"),
    };
  });
}

const seedPromise = readFile(seedPath, "utf8").then(parseCsv);
const aliasList = (entity: SeedEntity) => entity.aliases.split("|").map((item) => item.trim()).filter(Boolean);

describe("BATCH 12.2 — REGIONAL entities are regional links, never Greater Cairo cities", () => {
  it("classifies exactly the REGIONAL sector", async () => {
    const seed = await seedPromise;
    const regional = seed.filter(isRegionalLink);
    const codes = regional.map((entity) => entity.code).sort();
    expect(codes).toContain("CITY-ABU-SIMBEL");
    expect(codes).toContain("CITY-ALEXANDRIA");
    expect(codes).toHaveLength(28);
    // Nothing is retyped or deleted: they are still cities/districts in the register.
    const alexandria = seed.find((entity) => entity.code === "CITY-ALEXANDRIA")!;
    expect(alexandria.entity_type).toBe("city");
  });

  it("never presents a regional entity as a plain city", () => {
    const alexandria = { code: "CITY-ALEXANDRIA", name_ar: "إسكندرية", name_en: "Alexandria", entity_type: "city", sector: "REGIONAL" };
    expect(entityTypeLabel(alexandria, "ar")).toBe("نقطة ربط إقليمية");
    expect(entityTypeLabel(alexandria, "en")).toBe("Regional link");
    expect(entityTypeLabel(alexandria, "ar")).not.toBe("مدينة");
    expect(entityListLabel(alexandria, "ar")).toBe("إسكندرية · نقطة ربط إقليمية");
    expect(regionalLinkLabel("ar")).toBe("نقطة ربط إقليمية");
  });

  it("excludes regional links from Greater Cairo city lists and counts", async () => {
    const seed = await seedPromise;
    const cities = seed.filter((entity) => entity.entity_type === "city");
    const greaterCairoCities = cities.filter(isGreaterCairoCity);
    expect(cities.length).toBeGreaterThan(greaterCairoCities.length);
    expect(greaterCairoCities.map((entity) => entity.code)).not.toContain("CITY-ALEXANDRIA");
    expect(greaterCairoCities.map((entity) => entity.code)).not.toContain("CITY-ABU-SIMBEL");
    expect(greaterCairoCities.map((entity) => entity.code)).toContain("CITY-OBOUR");
  });

  it("splits a directory into the local group and the regional group without dropping anyone", async () => {
    const seed = await seedPromise;
    const { local, regional } = groupByRegionalScope(seed);
    expect(local.length + regional.length).toBe(seed.length);
    expect(regional).toHaveLength(28);
    expect(local.every((entity) => entity.sector !== "REGIONAL")).toBe(true);
  });
});

describe("BATCH 12.3 — no two search/directory rows render the same visible label", () => {
  it("gives the city and the monorail station different labels", () => {
    const city = { code: "CITY-6-OCTOBER", name_ar: "6 أكتوبر", name_en: "6th of October", entity_type: "city", sector: "WEST" };
    const station = { code: "STOP-6-OCTOBER-INTERCHANGE", name_ar: "6 أكتوبر", name_en: "6 October", entity_type: "transit_stop", sector: "WEST" };
    expect(entityListLabel(city, "ar")).toBe("6 أكتوبر · مدينة");
    expect(entityListLabel(station, "ar")).toContain("6 أكتوبر · محطة");
    expect(entityListLabel(city, "ar")).not.toBe(entityListLabel(station, "ar"));
    // Both new-OctoberCity entities are distinguishable too.
    const newCity = { code: "CITY-NEW-OCTOBER", name_ar: "أكتوبر الجديدة", name_en: "New October", entity_type: "city", sector: "WEST" };
    const newStation = { code: "STOP-MRW-NEW-OCTOBER", name_ar: "أكتوبر الجديدة", name_en: "New October", entity_type: "transit_stop", sector: "WEST" };
    expect(entityListLabel(newCity, "ar")).not.toBe(entityListLabel(newStation, "ar"));
  });

  it("qualifies stations with their mode or line", () => {
    const lrt = { code: "STOP-LRT-OBOUR", entity_type: "transit_stop" };
    expect(entityQualifier(lrt, "ar")).toContain("محطة");
    expect(entityQualifier(lrt, "ar")).toContain("القطار الكهربائي الخفيف");
    expect(entityQualifier({ code: "CITY-OBOUR", entity_type: "city" }, "ar")).toBeNull();
  });

  it("renders a unique visible label for every entity in the real seed", async () => {
    const seed = await seedPromise;
    const rows = seed.map((entity) => ({ code: entity.code, label: entityListLabel(entity, "ar") }));
    const collisions = duplicateVisibleLabels(rows);
    // This is the acceptance criterion: if it fails, the message names the offenders.
    expect(collisions, `colliding labels: ${JSON.stringify(collisions)}`).toHaveLength(0);

    const englishRows = seed.map((entity) => ({ code: entity.code, label: entityListLabel(entity, "en") }));
    expect(duplicateVisibleLabels(englishRows)).toHaveLength(0);
  });

  it("flags a shared alias with a disambiguation line instead of renaming anything", async () => {
    const seed = await seedPromise;
    const describe = (entity: SeedEntity) => ({
      code: entity.code,
      displayLabel: entityListLabel(entity, "ar"),
      names: [entity.name_ar, entity.name_en, ...aliasList(entity)].filter(Boolean),
    });
    const all = seed.map(describe);
    // CITY-6-OCTOBER carries the alias «أكتوبر» which also names the district حدائق أكتوبر's register entry.
    const cityOctober = seed.find((entity) => entity.code === "CITY-6-OCTOBER")!;
    expect(normalizeEntityName(cityOctober.name_ar)).toBe(normalizeEntityName("6 أكتوبر"));

    // «6 أكتوبر» appears as an exact name for two entities, so each gets a note pointing at the other.
    const city = all.find((row) => row.code === "CITY-6-OCTOBER")!;
    const station = all.find((row) => row.code === "STOP-6-OCTOBER-INTERCHANGE")!;
    const note = disambiguationNote(city, all, "ar");
    expect(note).toContain("اسم يتكرر");
    expect(note).toContain(station.displayLabel);
    expect(disambiguationNote(station, all, "ar")).toContain(city.displayLabel);

    // An entity with a globally unique name gets no note.
    const unique = all.find((row) => row.code === "CITY-SHOROUK")!;
    expect(disambiguationNote(unique, all, "ar")).not.toBeNull(); // «الشروق» collides with the LRT station
    const trulyUnique = all.find((row) => row.code === "AUTH-GOPP")!;
    expect(disambiguationNote(trulyUnique, all, "ar")).toBeNull();
  });

  it("normalises Arabic orthography so ا/أ and ة/ه collisions are caught", () => {
    expect(normalizeEntityName("أكتوبر")).toBe(normalizeEntityName("اكتوبر"));
    expect(normalizeEntityName("حدائق أكتوبر")).toBe(normalizeEntityName("حدائق اكتوبر"));
    expect(normalizeEntityName("العبور")).toBe(normalizeEntityName("العبـور"));
  });
});
