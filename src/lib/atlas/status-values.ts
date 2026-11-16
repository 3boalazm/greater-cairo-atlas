/** Shared status vocabulary, kept independent of server-side Zod schemas. */
export const ENTITY_STATUSES = [
  "operational", "partial", "under_construction", "planned", "approved_planned", "unknown",
] as const;
