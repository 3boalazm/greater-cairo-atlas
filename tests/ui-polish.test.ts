import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";
import { normalizeEntityName } from "@/lib/atlas/entity-presentation";
import { readRecent, rememberEntity, searchEntities, searchGroup, suggestedEntities } from "@/lib/atlas/search";
import { MapAttribution, MapLoading } from "@/components/atlas/MapChrome";

describe("search and map polish", () => {
  it("normalizes Arabic spelling, diacritics, tatweel and both Arabic digit sets", () => {
    expect(normalizeEntityName("أبــو زَعْبَل")).toBe(normalizeEntityName("ابو زعبل"));
    expect(normalizeEntityName("٦ أكتوبر")).toBe(normalizeEntityName("6 اكتوبر"));
    expect(normalizeEntityName("١٢۳۴ ة ى إ آ")).toBe("1234 ه ي ا ا");
  });
  it("searches actual aliases, English names and entity codes", async () => {
    const data = await getStaticAtlasDataset();
    const entities = data.entities.map((entity) => ({ ...entity, has_geometry: false }));
    const codes = (query: string) => searchEntities(entities, query).map((entity) => entity.code);
    expect(codes("6 اكتوبر")).toContain("CITY-6-OCTOBER");
    expect(codes("ابو زعبل")).toContain("DIST-ABU-ZAABAL");
    expect(codes("مونوريل العاصمة")).toContain("TRANSIT-MONORAIL-EAST");
    expect(codes("BRT")).toContain("TRANSIT-BRT");
    expect(codes("CITY-6-OCTOBER")).toContain("CITY-6-OCTOBER");
    expect(codes("East Nile Monorail")).toContain("TRANSIT-MONORAIL-EAST");
  });
  it("groups different entity types and keeps recent storage safe", () => {
    expect(searchGroup("city")).toBe("places");
    expect(searchGroup("transit_line")).toBe("lines");
    expect(searchGroup("rail_station")).toBe("stations");
    expect(searchGroup("bridge")).toBe("roads");
    expect(searchGroup("project")).toBe("landmarks");
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
    rememberEntity(storage, "CITY-6-OCTOBER"); rememberEntity(storage, "TRANSIT-BRT"); rememberEntity(storage, "CITY-6-OCTOBER");
    expect(readRecent(storage)).toEqual(["CITY-6-OCTOBER", "TRANSIT-BRT"]);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readRecent(blocked)).toEqual([]); expect(() => rememberEntity(blocked, "CITY-X")).not.toThrow();
    expect(suggestedEntities([], ["CITY-UNKNOWN"])).toEqual([]);
  });
  it("localizes loading and renders a single attribution with all licenses", () => {
    expect(renderToStaticMarkup(createElement(MapLoading, { language: "ar" }))).toContain("جارٍ تحميل الخريطة التفاعلية…");
    expect(renderToStaticMarkup(createElement(MapLoading, { language: "en" }))).toContain("Loading interactive map…");
    const html = renderToStaticMarkup(createElement(MapAttribution, { language: "ar" }));
    expect(html.match(/class="map-attribution/g)).toHaveLength(1);
    expect(html).toContain("CC BY 4.0"); expect(html).toContain("ODbL 1.0"); expect(html).toContain("CC BY-IGO");
    expect(html).toContain('aria-expanded="false"');
  });
});

it("renders a neutral expandable comparison with each source and linked entities", async () => {
  const { EntityPanel } = await import("@/components/atlas/EntityPanel");
  const { ResearchModeProvider } = await import("@/components/site/ResearchMode");
  const fact = (code: string, value: string, publisher: string, date: string) => ({
    code, attribute: "length_km", value, unit: "km", valid_as_of: date,
    valid_as_of_precision: "day" as const, verification_state: "single_source", notes: null,
    evidence: [{ code: `EV-${code}`, publisher, title: "Source", source_type: "news", url: "https://example.com", published_date: date, accessed_date: null }],
  });
  const station = { code: "STOP-A", name_ar: "محطة أ", name_en: "Station A", entity_type: "transit_stop", status: "operational" };
  const line = { code: "TRANSIT-LINE", name_ar: "الخط", name_en: "Line", entity_type: "transit_line", status: "operational" };
  const entity = { ...station, sector: "CENTRAL", aliases: [], has_geometry: true, description: null,
    facts: [fact("F-A", "7", "Source A", "2024-01-01"), fact("F-B", "9", "Source B", "2025-01-01")],
    relations: [{ subject_code: line.code, object_code: station.code, predicate: "has_station", ordinal: 1, evidence_ref: null, subject: line, object: station }], neighbors: [] };
  const html = renderToStaticMarkup(createElement(ResearchModeProvider, null, createElement(EntityPanel, { entity, loading: false, error: null, onClose: () => {}, onShowOnMap: () => {}, language: "ar", onToggleBoundary: () => {}, boundaryActive: false, boundaryLoading: false, onSelectRelated: () => {} })));
  expect(html).toContain("في مصادر مختلفة بأرقام مختلفة");
  expect(html).toContain("Source A"); expect(html).toContain("Source B");
  expect(html).toContain("2024-01-01"); expect(html).toContain("2025-01-01");
  expect(html).toContain("كيانات مرتبطة"); expect(html).toContain("الخط");
  expect(html).toContain("انسخ الرابط");
  expect(html).not.toContain("تنزيل GeoJSON");
});
