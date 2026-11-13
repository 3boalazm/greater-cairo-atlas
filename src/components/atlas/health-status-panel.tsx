"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ExternalLink, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { HealthCheckResponseBody } from "@/lib/db/health";

type ProbeUiState =
  | { kind: "loading" }
  | { kind: "resolved"; httpStatus: number; payload: HealthCheckResponseBody }
  | { kind: "network_error"; message: string };

async function fetchHealthEndpoint(
  signal?: AbortSignal,
): Promise<{ httpStatus: number; payload: HealthCheckResponseBody }> {
  const response = await fetch("/api/health", {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  const payload = (await response.json()) as HealthCheckResponseBody;
  return {
    httpStatus: response.status,
    payload,
  };
}

export function HealthStatusPanel() {
  const [state, setState] = useState<ProbeUiState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const result = await fetchHealthEndpoint(controller.signal);
        if (!controller.signal.aborted) {
          setState({
            kind: "resolved",
            httpStatus: result.httpStatus,
            payload: result.payload,
          });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          kind: "network_error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to reach /api/health endpoint.",
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const result = await fetchHealthEndpoint();
      setState({
        kind: "resolved",
        httpStatus: result.httpStatus,
        payload: result.payload,
      });
    } catch (error) {
      setState({
        kind: "network_error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to reach /api/health endpoint.",
      });
    }
  }, []);

  const renderBadge = () => {
    if (state.kind === "loading") {
      return <Badge variant="secondary">Checking…</Badge>;
    }
    if (state.kind === "network_error") {
      return <Badge variant="destructive">Request Failed</Badge>;
    }
    const { payload } = state;
    if (payload.ok) {
      return <Badge variant="success">Healthy (HTTP 200)</Badge>;
    }
    if (payload.status === "not_configured") {
      return <Badge variant="warning">DB Not Configured (HTTP 503)</Badge>;
    }
    return (
      <Badge variant="destructive">
        {payload.status === "misconfigured"
          ? "Misconfigured (HTTP 500)"
          : "Unhealthy (HTTP 503)"}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle>Spatial Database &amp; Migration Probe</CardTitle>
            {renderBadge()}
          </div>
          <CardDescription>
            Live status from{" "}
            <code className="font-mono text-xs text-foreground">/api/health</code>{" "}
            checking{" "}
            <code className="font-mono text-xs text-foreground">
              PostGIS_Version()
            </code>
            , SRID 4326 spatial serialization, and applied{" "}
            <code className="font-mono text-xs text-foreground">
              schema_migrations
            </code>{" "}
            count.
          </CardDescription>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleManualRefresh()}
            disabled={state.kind === "loading"}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${state.kind === "loading" ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Re-check
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="/api/health" target="_blank" rel="noreferrer">
              Health
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="/api/atlas/stats" target="_blank" rel="noreferrer">
              Stats
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {state.kind === "loading" && (
          <p className="text-sm text-muted-foreground">
            Querying <code className="font-mono text-xs">/api/health</code>…
          </p>
        )}

        {state.kind === "network_error" && (
          <div className="rounded-sm border border-red-700/25 bg-red-950/5 p-3 text-sm text-red-950">
            <p className="font-medium">Probe request failed</p>
            <p className="mt-1 text-xs opacity-90">{state.message}</p>
          </div>
        )}

        {state.kind === "resolved" && state.payload.ok && (
          <dl className="grid gap-3 rounded-sm border border-border bg-muted/40 p-3.5 text-xs sm:grid-cols-4">
            <div>
              <dt className="font-medium text-muted-foreground">
                PostGIS Version
              </dt>
              <dd className="mt-1 font-mono text-foreground">
                {state.payload.database.postgisVersion}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                Applied Migrations
              </dt>
              <dd className="mt-1 font-mono text-foreground">
                {state.payload.database.appliedMigrationsCount}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                Round-Trip Latency
              </dt>
              <dd className="mt-1 font-mono text-foreground">
                {state.payload.latencyMs} ms
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">
                SRID 4326 Probe Output
              </dt>
              <dd className="mt-1 break-all font-mono text-foreground">
                {state.payload.database.spatialProbe.geoJsonRaw}
              </dd>
            </div>
          </dl>
        )}

        {state.kind === "resolved" && !state.payload.ok && (
          <div className="space-y-2 rounded-sm border border-amber-700/30 bg-amber-950/5 p-3.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-amber-950">
                {state.payload.error.code}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                HTTP {state.httpStatus}
                {state.payload.database.appliedMigrationsCount !== null
                  ? ` · Applied Migrations: ${state.payload.database.appliedMigrationsCount}`
                  : ""}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-foreground">
              {state.payload.error.message}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
