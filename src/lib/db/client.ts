import {
  Client,
  neon,
  neonConfig,
  type NeonQueryFunction,
} from "@neondatabase/serverless";
import ws from "ws";
import {
  requireDatabaseEnv,
  requireMigrationDatabaseEnv,
} from "@/lib/env";

function assertServerRuntime(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "Database client cannot be imported or executed in a browser environment.",
    );
  }
}

let cachedConnectionString: string | null = null;
let cachedSqlClient: NeonQueryFunction<false, false> | null = null;

/**
 * Returns a stateless Neon HTTP query function configured exclusively
 * from process.env.DATABASE_URL. Ideal for Next.js Route Handlers,
 * Server Components, and Vercel Serverless / Preview functions.
 */
export function getSql(): NeonQueryFunction<false, false> {
  assertServerRuntime();
  const { DATABASE_URL } = requireDatabaseEnv();

  if (cachedSqlClient && cachedConnectionString === DATABASE_URL) {
    return cachedSqlClient;
  }

  cachedConnectionString = DATABASE_URL;
  cachedSqlClient = neon(DATABASE_URL);
  return cachedSqlClient;
}

/**
 * Creates a session-capable Neon PostgreSQL WebSocket client for CLI / build
 * workloads requiring advisory locks and interactive transactions (e.g. migrations
 * and seed imports). Prefers DATABASE_URL_UNPOOLED over pooled DATABASE_URL.
 */
export function createNeonSessionClient(
  rawEnv: NodeJS.ProcessEnv = process.env,
): Client {
  assertServerRuntime();
  const { connectionString } = requireMigrationDatabaseEnv(rawEnv);

  if (typeof WebSocket === "undefined") {
    neonConfig.webSocketConstructor = ws;
  }

  return new Client({
    connectionString,
  });
}
