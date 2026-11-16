import type { AtlasEntitySummary, EntityListResponse } from "./atlas-client";

/** Publish the first page immediately, then append subsequent pages for the same filters. */
export async function loadEntities(
  params: URLSearchParams,
  signal: AbortSignal,
  publish: (entities: AtlasEntitySummary[]) => void,
  fetchPage: typeof fetch = fetch,
): Promise<void> {
  const query = new URLSearchParams(params);
  const limit = 500;
  query.set("limit", String(limit));
  query.delete("offset"); // The first request remains identical to the original request.
  const entities: AtlasEntitySummary[] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (;;) {
    signal.throwIfAborted();
    if (offset) query.set("offset", String(offset));
    const response = await fetchPage(`/api/atlas/entities?${query}`, { signal });
    if (!response.ok) throw new Error((await response.json()).error?.message ?? `HTTP ${response.status}`);
    const page = await response.json() as EntityListResponse;
    signal.throwIfAborted();
    for (const entity of page.entities) {
      if (!seen.has(entity.code)) { seen.add(entity.code); entities.push(entity); }
    }
    // Use a fresh array each time so React observes subsequent page updates.
    publish([...entities]);
    offset += limit;
    if (offset >= page.total) {
      if (entities.length < page.total) throw new Error("Entity list is incomplete; please retry.");
      return;
    }
    if (page.entities.length === 0) throw new Error("Entity list is incomplete; please retry.");
  }
}
