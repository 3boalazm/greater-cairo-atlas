import initSqlJs from "sql.js";
import path from "node:path";
import { ENTITY_SECTORS, ENTITY_STATUSES, ENTITY_TYPES, type EntitySeed, type EntityStatus, type EntityType, type EntitySector } from "@/lib/atlas/schema";
import type { StaticAtlasDataset } from "@/lib/atlas/static-dataset";
import { resolveStatusByYear } from "@/lib/atlas/status-timeline";

export interface GeoPackageFilters { type?: EntityType | "transport"; sector?: EntitySector; status?: EntityStatus; year?: number; }
let sqlPromise: ReturnType<typeof initSqlJs> | null = null;
async function getSqlJs() {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => path.join(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm") });
  return sqlPromise;
}

export function parseGeoPackageFilters(params: URLSearchParams): GeoPackageFilters {
  const result: GeoPackageFilters = {};
  const type = params.get("type"); if (type) { if (type !== "transport" && !(ENTITY_TYPES as readonly string[]).includes(type)) throw new Error("Invalid entity type filter."); result.type = type as EntityType | "transport"; }
  const sector = params.get("sector"); if (sector) { if (!(ENTITY_SECTORS as readonly string[]).includes(sector)) throw new Error("Invalid sector filter."); result.sector = sector as EntitySector; }
  const status = params.get("status"); if (status) { if (!(ENTITY_STATUSES as readonly string[]).includes(status)) throw new Error("Invalid status filter."); result.status = status as EntityStatus; }
  const year = params.get("year"); if (year) { const n = Number(year); if (!Number.isInteger(n) || n < 1000 || n > 9999) throw new Error("Invalid timeline year."); result.year = n; }
  return result;
}

function wkb(geometry: { type: string; coordinates?: unknown; geometries?: unknown[] }): Buffer {
  const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const f64 = (n: number) => { const b = Buffer.alloc(8); b.writeDoubleLE(n); return b; };
  const coord = (point: unknown) => {
    if (!Array.isArray(point) || point.length < 2) throw new Error("Invalid coordinate in GeoPackage export.");
    return Buffer.concat([f64(Number(point[0])), f64(Number(point[1]))]);
  };
  const line = (points: unknown) => {
    if (!Array.isArray(points)) throw new Error("Invalid line coordinates.");
    return Buffer.concat([u32(points.length), ...points.map(coord)]);
  };
  const polygon = (rings: unknown) => {
    if (!Array.isArray(rings)) throw new Error("Invalid polygon coordinates.");
    return Buffer.concat([u32(rings.length), ...rings.map(line)]);
  };
  const typeMap: Record<string, number> = { Point: 1, LineString: 2, Polygon: 3, MultiPoint: 4, MultiLineString: 5, MultiPolygon: 6, GeometryCollection: 7 };
  const type = typeMap[geometry.type];
  if (!type) throw new Error(`Unsupported GeoPackage geometry type: ${geometry.type}`);
  const header = Buffer.concat([Buffer.from([1]), u32(type)]);
  const coordinates = geometry.coordinates;
  if (type === 1) return Buffer.concat([header, coord(coordinates)]);
  if (type === 2) return Buffer.concat([header, line(coordinates)]);
  if (type === 3) return Buffer.concat([header, polygon(coordinates)]);
  if (type >= 4 && type <= 6) {
    if (!Array.isArray(coordinates)) throw new Error("Invalid multi-geometry coordinates.");
    const childType = type - 3;
    const parts = coordinates.map((part) => wkb({ type: ["", "Point", "LineString", "Polygon"][childType]!, coordinates: part }));
    return Buffer.concat([header, u32(parts.length), ...parts]);
  }
  const geometries = geometry.geometries ?? [];
  const parts = geometries.map((part) => wkb(part as { type: string; coordinates?: unknown; geometries?: unknown[] }));
  return Buffer.concat([header, u32(parts.length), ...parts]);
}

function gpkgGeometry(geometry: { type: string; coordinates?: unknown; geometries?: unknown[] }): Buffer {
  const srs = Buffer.alloc(4); srs.writeInt32LE(4326);
  return Buffer.concat([Buffer.from([0x47, 0x50, 0, 1]), srs, wkb(geometry)]);
}

const entityRows = (entities: readonly EntitySeed[]) => entities.map((entity) => [entity.code, entity.name_ar, entity.name_en, entity.entity_type, entity.sector, entity.status, entity.description, JSON.stringify(entity.aliases)]);

export async function generateGeoPackage(dataset: StaticAtlasDataset, filters: GeoPackageFilters = {}): Promise<Uint8Array> {
  const timeline = filters.year ? resolveStatusByYear(dataset.facts.filter((fact) => fact.valid_as_of).map((fact) => ({
    entity_code: fact.entity_code, attribute: fact.attribute, value: fact.value, valid_as_of: fact.valid_as_of!,
    valid_as_of_precision: fact.valid_as_of_precision, verification_state: fact.verification_state, fact_code: fact.code,
  })), filters.year) : null;
  const transportTypes = ["transit_line", "transit_stop", "rail_station", "transit_station"];
  const entities = dataset.entities.filter((entity) =>
    (!filters.type || (filters.type === "transport" ? transportTypes.includes(entity.entity_type) : entity.entity_type === filters.type)) && (!filters.sector || entity.sector === filters.sector) &&
    (!filters.status || (filters.year ? (timeline?.get(entity.code)?.status ?? "unknown") : entity.status) === filters.status));
  const entityByCode = new Map(entities.map((entity) => [entity.code, entity]));
  const features = dataset.features.filter((feature) => entityByCode.has(feature.entity_code));
  const SQL = await getSqlJs();
  const db = new SQL.Database();
  try {
    db.run("PRAGMA application_id = 1196444487; PRAGMA user_version = 10300;");
    db.run(`CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
      CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER);
      CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, PRIMARY KEY (table_name, column_name));
      INSERT INTO gpkg_spatial_ref_sys VALUES ('Undefined Cartesian',-1,'NONE',-1,'undefined','undefined Cartesian coordinate reference system');
      INSERT INTO gpkg_spatial_ref_sys VALUES ('Undefined Geographic',0,'NONE',0,'undefined','undefined geographic coordinate reference system');
      INSERT INTO gpkg_spatial_ref_sys VALUES ('WGS 84 geodetic',4326,'EPSG',4326,'GEOGCS[\"WGS 84\",DATUM[\"World Geodetic System 1984\",SPHEROID[\"WGS 84\",6378137,298.257223563]],PRIMEM[\"Greenwich\",0],UNIT[\"degree\",0.0174532925199433]]','longitude/latitude coordinates in decimal degrees');
      CREATE TABLE entities (code TEXT PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL, entity_type TEXT NOT NULL, sector TEXT NOT NULL, status TEXT NOT NULL, description TEXT, aliases_json TEXT NOT NULL);
      CREATE TABLE features (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB NOT NULL, feature_code TEXT NOT NULL UNIQUE, entity_code TEXT NOT NULL, name_ar TEXT NOT NULL, name_en TEXT NOT NULL, entity_type TEXT NOT NULL, status TEXT NOT NULL, license TEXT NOT NULL, attribution TEXT NOT NULL, source TEXT NOT NULL, retrieval_date TEXT NOT NULL, source_ids_json TEXT NOT NULL);
      CREATE TABLE admin_units (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB NOT NULL, pcode TEXT NOT NULL UNIQUE, level INTEGER NOT NULL, name_ar TEXT NOT NULL, name_en TEXT, parent_pcode TEXT, parent_name_ar TEXT, area_sqkm REAL NOT NULL, license TEXT NOT NULL, attribution TEXT NOT NULL, source TEXT NOT NULL, evidence_code TEXT NOT NULL);
      CREATE TABLE license_attribution (kind TEXT NOT NULL, license TEXT NOT NULL, attribution TEXT NOT NULL, note TEXT NOT NULL);
      INSERT INTO gpkg_contents (table_name,data_type,identifier,description,srs_id) VALUES ('entities','attributes','Greater Cairo Atlas entities','Entity records matched to the selected GeoPackage feature filter.',NULL);
      INSERT INTO gpkg_contents (table_name,data_type,identifier,description,srs_id) VALUES ('features','features','Greater Cairo Atlas features','WGS 84 source geometries; see license_attribution table.',4326);
      INSERT INTO gpkg_contents (table_name,data_type,identifier,description,srs_id) VALUES ('admin_units','features','CAPMAS COD-AB administrative units','WGS 84 official administrative units; see license_attribution table.',4326);
      INSERT INTO gpkg_contents (table_name,data_type,identifier,description,srs_id) VALUES ('license_attribution','attributes','License and attribution','Preserve these attributions when redistributing this GeoPackage.',NULL);
      INSERT INTO gpkg_geometry_columns VALUES ('features','geom','GEOMETRY',4326,0,0);
      INSERT INTO gpkg_geometry_columns VALUES ('admin_units','geom','GEOMETRY',4326,0,0);
    `);
    const entityInsert = db.prepare("INSERT INTO entities VALUES (?,?,?,?,?,?,?,?)");
    for (const row of entityRows(entities)) entityInsert.run(row);
    entityInsert.free();
    const featureInsert = db.prepare("INSERT INTO features (geom,feature_code,entity_code,name_ar,name_en,entity_type,status,license,attribution,source,retrieval_date,source_ids_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
    for (const feature of features) {
      const entity = entityByCode.get(feature.entity_code)!;
      const props = (feature.properties?.properties ?? {}) as Record<string, unknown>;
      const at = timeline?.get(entity.code);
      const status = filters.year ? at?.status ?? "unknown" : entity.status;
      const attribution = feature.license === "ODbL-1.0" ? "© OpenStreetMap contributors, ODbL 1.0" : String(props.attribution ?? "© Mustafa Aboalazm, CC BY 4.0");
      featureInsert.run([gpkgGeometry(feature.geometry as { type: string; coordinates?: unknown; geometries?: unknown[] }), feature.code, entity.code, entity.name_ar, entity.name_en,
        entity.entity_type, status, feature.license, attribution, String(props.source ?? ""), String(props.retrieval_date ?? ""), JSON.stringify(props.source_ids ?? [])]);
    }
    featureInsert.free();
    const adminUnitInsert = db.prepare("INSERT INTO admin_units (geom,pcode,level,name_ar,name_en,parent_pcode,parent_name_ar,area_sqkm,license,attribution,source,evidence_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
    for (const feature of dataset.adminUnits) {
      const props = feature.properties;
      const parents = Array.isArray(props.parent_pcodes) ? props.parent_pcodes : [];
      adminUnitInsert.run([
        gpkgGeometry(feature.geometry as { type: string; coordinates?: unknown; geometries?: unknown[] }),
        String(props.pcode), Number(props.level), String(props.name_ar), props.name_en == null ? null : String(props.name_en),
        parents.length ? String(parents[0]) : null, String(props.parent_name_ar ?? ""), Number(props.area_sqkm ?? 0),
        "CC-BY-IGO", String(props.attribution ?? ""), String(props.source ?? "CAPMAS COD-AB 2017 (reviewed 2024)"), String(props.evidence_code ?? "EV-CODAB-ADMIN-2026"),
      ]);
    }
    adminUnitInsert.free();
    const attrInsert = db.prepare("INSERT INTO license_attribution VALUES (?,?,?,?)");
    attrInsert.run(["Research data and evidence", "CC BY 4.0", "© Mustafa Aboalazm (مصطفى أبوالعزم)", "Attribution required."]);
    attrInsert.run(["OpenStreetMap geometry", "ODbL 1.0", "© OpenStreetMap contributors", "Keep ODbL attribution and comply with the ODbL when sharing derived databases."]);
    attrInsert.run(["Official administrative boundaries", "CC-BY-IGO", "© CAPMAS (الجهاز المركزي للتعبئة العامة والإحصاء) via OCHA/HDX", "Source: https://data.humdata.org/dataset/cod-ab-egy. Preserve this attribution."]);
    attrInsert.run(["Basemap", "OpenFreeMap", "OpenFreeMap", "Basemap tiles are not embedded in this export."]);
    attrInsert.free();
    db.run("CREATE INDEX features_entity_code_idx ON features(entity_code); CREATE INDEX features_type_sector_idx ON features(entity_type,status);");
    return db.export();
  } finally { db.close(); }
}
