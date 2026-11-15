import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const read = (relative: string) => readFile(path.join(process.cwd(), relative), "utf8");

/** Import lines only — a mention in a comment is not a dependency. */
const importsOf = (source: string) => source.split("\n").filter((line) => /^\s*import\s/u.test(line)).join("\n");

/** Code only: a promise made in a comment ("the token is never written to localStorage") is not a call. */
const codeOf = (source: string) => source
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\/?\*)/u.test(line))
  .join("\n");

const ADMIN_COMPONENTS = [
  "src/components/admin/AdminShell.tsx",
  "src/components/admin/AdminDashboard.tsx",
  "src/components/admin/AdminEntities.tsx",
  "src/components/admin/AdminFacts.tsx",
  "src/components/admin/AdminGeometry.tsx",
  "src/components/admin/AdminGaps.tsx",
  "src/components/admin/AdminImport.tsx",
];

describe("BATCH 13 — the admin workspace cannot leak the token or fake a number", () => {
  it("never persists the token to browser storage", async () => {
    for (const file of ADMIN_COMPONENTS) {
      const code = codeOf(await read(file));
      expect(code, file).not.toMatch(/localStorage|sessionStorage/u);
      expect(code, file).not.toMatch(/document\.cookie/u);
    }
  });

  it("never puts the token into a URL", async () => {
    for (const file of ADMIN_COMPONENTS) {
      const source = await read(file);
      // A token in a query string ends up in access logs, referrers and browser history.
      expect(source, file).not.toMatch(/[?&]token=/u);
    }
  });

  it("sends the token only as an Authorization header", async () => {
    for (const file of ADMIN_COMPONENTS) {
      const source = await read(file);
      if (!source.includes("fetch(")) continue;
      expect(source, file).toContain("Authorization: `Bearer ${token}`");
    }
  });

  it("imports the client-safe boundary helper, never the node:fs one", async () => {
    for (const file of ADMIN_COMPONENTS) {
      const imports = importsOf(await read(file));
      expect(imports, file).not.toContain("area-boundaries");
    }
  });

  it("renders a missing count as a dash, not as zero", async () => {
    const source = await read("src/components/admin/AdminShell.tsx");
    // The metric primitive is the single place that formats a count.
    expect(source).toContain('value === null ? "—"');
    expect(source).toContain('typeof value === "number" ? value.toLocaleString("en-US")');
  });

  it("documents why the dashboard's boundary count comes from the files", async () => {
    const route = await read("src/app/api/admin/dashboard/route.ts");
    expect(route).toContain("getAreaBoundaryCodes");
  });

  it("keeps the admin pages out of search indexes", async () => {
    const robots = await read("src/app/robots.ts");
    expect(robots).toMatch(/disallow:\s*\[[^\]]*"\/admin"/u);
    for (const page of ["src/app/admin/page.tsx", "src/app/admin/entities/page.tsx", "src/app/admin/facts/page.tsx",
      "src/app/admin/geometry/page.tsx", "src/app/admin/gaps/page.tsx", "src/app/admin/import/page.tsx"]) {
      const source = await read(page);
      expect(source, page).toContain('robots: { index: false, follow: false }');
    }
  });

  it("renders every admin page right-to-left in Arabic", async () => {
    for (const page of ["src/app/admin/page.tsx", "src/app/admin/entities/page.tsx", "src/app/admin/facts/page.tsx",
      "src/app/admin/geometry/page.tsx", "src/app/admin/gaps/page.tsx", "src/app/admin/import/page.tsx"]) {
      const source = await read(page);
      expect(source, page).toMatch(/dir=\{ar \? "rtl" : "ltr"\}/u);
    }
  });
});

describe("BATCH 13 — the import route refuses to commit unreviewed bytes", () => {
  it("requires a preview checksum before writing anything", async () => {
    const route = await read("src/app/api/admin/import/route.ts");
    expect(route).toMatch(/if \(previewChecksum !== plan\.checksum\)/u);
    expect(route).toMatch(/mode: z\.enum\(\["dry_run", "commit"\]\)\.default\("dry_run"\)/u);
  });

  it("inserts every imported fact as a candidate", async () => {
    // The insert lives in the commit module (tested against the real schema in
    // admin-import-commit.test.ts); this guard is about the SQL literal itself.
    const commit = await read("src/lib/admin/import-commit.ts");
    const factInsert = commit.slice(commit.indexOf("INSERT INTO facts"));
    expect(factInsert).toContain("'candidate'");
    expect(factInsert).not.toContain("'verified'");
  });

  it("writes an audit row for a commit", async () => {
    const route = await read("src/app/api/admin/import/route.ts");
    expect(route).toContain("admin_audit_log");
    expect(route).toContain("import.commit");
  });
});

describe("BATCH 13 — filter options are read from the data, not invented", () => {
  it("offers only values that exist in the table", async () => {
    const queries = await read("src/lib/admin/queries.ts");
    expect(queries).toContain("getEntityFilterOptions");
    expect(queries).toMatch(/SELECT 'type' AS kind, entity_type AS value FROM entities/u);
  });

  it("does not hardcode a status or type list in the entities screen", async () => {
    const source = await read("src/components/admin/AdminEntities.tsx");
    // A frozen list drifts from the schema: it offers what no longer exists and hides what does
    // (`partial` and `approved_planned` are real statuses that a hand-written list had omitted).
    expect(source).not.toMatch(/const (TYPES|SECTORS|STATUSES)\s*=/u);
    expect(source).toContain("options.types.map");
    expect(source).toContain("options.statuses.map");
  });
});
