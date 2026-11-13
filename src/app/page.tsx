import { Compass, Database, FileCheck2, Layers } from "lucide-react";
import { HealthStatusPanel } from "@/components/atlas/health-status-panel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CORE_SCHEMA_TABLES,
  EPISTEMIC_PRINCIPLES,
  PILOT_COVERAGE_AREAS,
} from "@/lib/atlas/constants";

export default function AtlasLandingPage() {
  return (
    <div className="atlas-grid-bg min-h-screen">
      <header className="border-b border-border bg-card/85 backdrop-blur-xs">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Compass className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="font-semibold tracking-tight text-foreground">
              Greater Cairo Atlas
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              SRID 4326 · WGS 84
            </Badge>
            <Badge variant="secondary" className="font-mono">
              Phase 02 · Core Schema
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        <section className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Evidentiary Urban &amp; Geospatial Documentation · Greater Cairo, Egypt
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            A source-backed geospatial atlas of Greater Cairo.
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
            Greater Cairo Atlas is a data-first urban documentation project—not
            a real-estate marketplace or promotional directory. Every spatial
            feature and factual claim must retain verifiable provenance,
            conflicting measurements are preserved side by side rather than
            silently overwritten, and planned or under-construction projects are
            never rendered as operational.
          </p>
        </section>

        <section aria-label="Database and PostGIS health">
          <HealthStatusPanel />
        </section>

        <section className="space-y-4" aria-labelledby="principles-heading">
          <div className="flex items-center gap-2">
            <FileCheck2
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <h2
              id="principles-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Data Integrity &amp; Epistemic Rules
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {EPISTEMIC_PRINCIPLES.map((principle) => (
              <Card key={principle.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{principle.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {principle.summary}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Layers
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <CardTitle>Pilot Coverage Scope (Phase 03 Ingestion)</CardTitle>
              </div>
              <CardDescription>
                Target urban districts and new cities for batch Python
                ingestion. No unverified boundaries, coordinates, or operational
                statuses are pre-populated in Phase 02.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-2">
                {PILOT_COVERAGE_AREAS.map((area) => (
                  <li key={area}>
                    <Badge variant="secondary" className="px-2.5 py-1 text-xs">
                      {area}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <CardTitle>Core Relational &amp; Spatial Schema</CardTitle>
              </div>
              <CardDescription>
                Defined in{" "}
                <code className="font-mono text-xs text-foreground">
                  001_core_schema.sql
                </code>{" "}
                with strict enum{" "}
                <code className="font-mono text-xs text-foreground">CHECK</code>{" "}
                constraints,{" "}
                <code className="font-mono text-xs text-foreground">
                  ON DELETE RESTRICT
                </code>{" "}
                foreign keys, and{" "}
                <code className="font-mono text-xs text-foreground">
                  updated_at
                </code>{" "}
                triggers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5 text-xs">
                {CORE_SCHEMA_TABLES.map((table) => (
                  <div
                    key={table.name}
                    className="flex flex-col gap-0.5 border-b border-border/70 pb-2 last:border-0 last:pb-0"
                  >
                    <dt className="font-mono font-semibold text-foreground">
                      {table.name}
                    </dt>
                    <dd className="text-muted-foreground">{table.purpose}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t border-border bg-card/60">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-4 text-xs text-muted-foreground">
          <span>Greater Cairo Atlas · Phase 02 Core Schema</span>
          <span className="font-mono">
            Next.js · TypeScript Strict · Neon PostgreSQL + PostGIS
          </span>
        </div>
      </footer>
    </div>
  );
}
