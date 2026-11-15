import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = path.resolve(process.cwd(), ".github/workflows/ci.yml");

describe("BATCH 12.1 — CI runs on every PR and on main", () => {
  it("triggers on pull_request to main, push to main, and keeps manual dispatch", async () => {
    const yaml = await readFile(workflowPath, "utf8");
    const triggerBlock = yaml.slice(yaml.indexOf("\non:"), yaml.indexOf("permissions:"));
    expect(triggerBlock).toMatch(/pull_request:\s*\n\s*branches:\s*\[main\]/u);
    expect(triggerBlock).toMatch(/push:\s*\n\s*branches:\s*\[main\]/u);
    // Manual dispatch must survive: the owner has no Actions minutes and relies on it.
    expect(triggerBlock).toContain("workflow_dispatch:");
    // A PR must never be able to skip the gate by only having a push trigger.
    expect(triggerBlock).not.toContain("pull_request_target");
  });

  it("runs lint, typecheck, unit tests and a production build", async () => {
    const yaml = await readFile(workflowPath, "utf8");
    for (const step of ["npm run lint", "npm run typecheck", "npm test", "npm run build", "npm run seed:check", "npm run db:migrate:dry-run"]) {
      expect(yaml, step).toContain(step);
    }
    // No secrets are required by CI: everything it runs must work without a database.
    expect(yaml).not.toContain("${{ secrets.");
  });
});
