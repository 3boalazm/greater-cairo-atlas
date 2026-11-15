import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import {
  acceptSubmission, applyFactReview, attachEvidence, listAuditRows, rejectSubmission,
  type AdminWriteContext, type TransactionalExecutor,
} from "@/lib/admin/mutations";

async function migratedDatabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { postgis } });
  const dir = path.join(process.cwd(), "db/migrations");
  for (const file of [
    "000_enable_postgis.sql", "001_core_schema.sql", "002_entity_taxonomy.sql", "003_research_seed_extensions.sql",
    "004_feature_bbox_attribution.sql", "009_entity_relations.sql", "010_submissions.sql", "011_admin_review.sql",
  ]) await db.exec(await readFile(path.join(dir, file), "utf8"));
  return db;
}

const executor = (db: PGlite): TransactionalExecutor => ({
  async query<Row>(text: string, values?: unknown[]): Promise<Row[]> {
    return (await db.query(text, values)).rows as Row[];
  },
});

const actor: AdminWriteContext = { actor: "admin:test", token_fingerprint: "f".repeat(64) };

async function fixtures(db: PGlite): Promise<void> {
  await db.exec(`
    INSERT INTO entities (code, name_ar, name_en, entity_type, sector, status) VALUES
      ('CITY-OBOUR','العبور','El Obour','city','EAST','operational');
    INSERT INTO evidence (code, title, url, publisher, source_type, accessed_date) VALUES
      ('EV-OFFICIAL','Ministry','https://example.gov.eg/a','Ministry','official', CURRENT_DATE),
      ('EV-NOURL','News',NULL,'Outlet','news', CURRENT_DATE);
    INSERT INTO facts (code, entity_id, attribute, value, verification_state)
      SELECT 'F-OBOUR-1', id, 'operational_status', 'operational', 'candidate' FROM entities WHERE code='CITY-OBOUR';
    INSERT INTO facts (code, entity_id, attribute, value, verification_state)
      SELECT 'F-OBOUR-BARE', id, 'population', '500000', 'candidate' FROM entities WHERE code='CITY-OBOUR';
    INSERT INTO fact_evidence (fact_id, evidence_id)
      SELECT f.id, e.id FROM facts f, evidence e WHERE f.code='F-OBOUR-1' AND e.code='EV-OFFICIAL';
    INSERT INTO submissions (entity_code, attribute, proposed_value, source_url, request_fingerprint)
      VALUES ('CITY-OBOUR','population','600000','https://example.org/mayor', repeat('a', 64));
  `);
}

describe("BATCH 13 — every mutation writes an audit row", () => {
  it("records approve with before/after and keeps the evidence", async () => {
    const db = await migratedDatabase();
    try {
      await fixtures(db);
      const result = await applyFactReview(executor(db), actor, "F-OBOUR-1", { action: "approve" });
      expect(result.review_state).toBe("approved");
      expect(result.verification_state).toBe("verified");

      const audit = await listAuditRows(executor(db));
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ action: "fact.approve", actor: "admin:test", fact_code: "F-OBOUR-1", entity_code: "CITY-OBOUR" });
      expect(audit[0]!.before_state).toMatchObject({ review_state: "pending", verification_state: "candidate" });
      expect(audit[0]!.after_state).toMatchObject({ review_state: "approved", verification_state: "verified" });

      const facts = await db.query<{ verification_state: string }>("SELECT verification_state FROM facts WHERE code='F-OBOUR-1'");
      expect(facts.rows[0]!.verification_state).toBe("verified");
      // Evidence was not touched.
      const links = await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM fact_evidence");
      expect(links.rows[0]!.count).toBe(1);
    } finally { await db.close(); }
  }, 60000);

  it("approving an unsourced fact does not create a verified claim", async () => {
    const db = await migratedDatabase();
    try {
      await fixtures(db);
      const result = await applyFactReview(executor(db), actor, "F-OBOUR-BARE", { action: "approve" });
      expect(result.review_state).toBe("approved");
      expect(result.verification_state).toBe("candidate");
      expect(result.verification_unchanged_reason).toContain("official source with a URL");
      // The database really still says candidate, and migration 008's trigger was not tripped.
      const facts = await db.query<{ verification_state: string }>("SELECT verification_state FROM facts WHERE code='F-OBOUR-BARE'");
      expect(facts.rows[0]!.verification_state).toBe("candidate");
      const audit = await listAuditRows(executor(db));
      expect(audit[0]!.after_state).toMatchObject({ verification_state: "candidate" });
    } finally { await db.close(); }
  }, 60000);

  it("reject keeps the fact and its evidence and requires a reason", async () => {
    const db = await migratedDatabase();
    try {
      await fixtures(db);
      await expect(applyFactReview(executor(db), actor, "F-OBOUR-1", { action: "reject" })).rejects.toThrow(/reason/i);
      const result = await applyFactReview(executor(db), actor, "F-OBOUR-1", { action: "reject", reason: "decree superseded it" });
      expect(result.review_state).toBe("rejected");
      const facts = await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM facts");
      expect(facts.rows[0]!.count).toBe(2);
      const links = await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM fact_evidence");
      expect(links.rows[0]!.count).toBe(1);
      const audit = await listAuditRows(executor(db));
      expect(audit[0]).toMatchObject({ action: "fact.reject", reason: "decree superseded it" });
    } finally { await db.close(); }
  }, 60000);

  it("refuses to overwrite another reviewer's decision", async () => {
    const db = await migratedDatabase();
    try {
      await fixtures(db);
      await applyFactReview(executor(db), actor, "F-OBOUR-1", { action: "approve" });
      await expect(applyFactReview(executor(db), actor, "F-OBOUR-1", { action: "reject", reason: "changed my mind", expected_state: "pending" })).rejects.toThrow(/already reviewed|currently approved/i);
      // The original decision is intact.
      const review = await db.query<{ review_state: string }>("SELECT review_state FROM fact_reviews WHERE fact_code='F-OBOUR-1'");
      expect(review.rows[0]!.review_state).toBe("approved");
    } finally { await db.close(); }
  }, 60000);

  it("attaching contradicting evidence disputes the claim but never deletes it", async () => {
    const db = await migratedDatabase();
    try {
      await fixtures(db);
      const result = await attachEvidence(executor(db), actor, "F-OBOUR-1", {
        stance: "contradicting", evidence_code: "EV-NOURL", reason: "a second outlet reports the opposite",
      });
      expect(result.review_state).toBe("disputed");
      const facts = await db.query<{ verification_state: string }>("SELECT verification_state FROM facts WHERE code='F-OBOUR-1'");
      expect(facts.rows[0]!.verification_state).toBe("disputed");
      const links = await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM fact_evidence");
      expect(links.rows[0]!.count).toBe(2);
      const audit = await listAuditRows(executor(db));
      expect(audit[0]).toMatchObject({ action: "evidence.attach", evidence_code: "EV-NOURL" });
      expect(audit[0]!.after_state).toMatchObject({ stance: "contradicting", review_state: "disputed" });
    } finally { await db.close(); }
  }, 60000);

  it("rejects an unknown fact or evidence code instead of writing half a record", async () => {
    const db = await migratedDatabase();
    try {
      await fixtures(db);
      await expect(applyFactReview(executor(db), actor, "F-NOPE", { action: "approve" })).rejects.toThrow(/Unknown fact/u);
      await expect(attachEvidence(executor(db), actor, "F-OBOUR-1", { stance: "supporting", evidence_code: "EV-NOPE", reason: "x" })).rejects.toThrow(/Unknown evidence/u);
      const audit = await listAuditRows(executor(db));
      expect(audit).toHaveLength(0);
    } finally { await db.close(); }
  }, 60000);
});

describe("BATCH 13 — submissions become candidates, never verified facts", () => {
  it("accepting a submission creates a candidate fact with community evidence", async () => {
    const db = await migratedDatabase();
    try {
      await fixtures(db);
      const [submission] = (await db.query<{ id: string }>("SELECT id FROM submissions LIMIT 1")).rows;
      const result = await acceptSubmission(executor(db), actor, submission!.id);
      expect(result.verification_state).toBe("candidate");

      const fact = await db.query<{ verification_state: string; value: string }>("SELECT verification_state, value FROM facts WHERE code = $1", [result.fact_code]);
      expect(fact.rows[0]).toMatchObject({ verification_state: "candidate", value: "600000" });

      // The evidence is recorded as community, not official.
      const evidence = await db.query<{ source_type: string }>("SELECT source_type FROM evidence WHERE code LIKE 'EV-SUB-%'");
      // A submitter's URL is unvetted, so it is `secondary` — a value the schema already forbids from
      // ever backing a `verified` fact (migration 002's trigger).
      expect(evidence.rows[0]!.source_type).toBe("secondary");

      const status = await db.query<{ status: string }>("SELECT status FROM submissions");
      expect(status.rows[0]!.status).toBe("accepted");

      const audit = await listAuditRows(executor(db));
      expect(audit[0]).toMatchObject({ action: "submission.accept" });
      expect(audit[0]!.after_state).toMatchObject({ verification_state: "candidate" });
    } finally { await db.close(); }
  }, 60000);

  it("refuses to accept the same submission twice", async () => {
    const db = await migratedDatabase();
    try {
      await fixtures(db);
      const [submission] = (await db.query<{ id: string }>("SELECT id FROM submissions LIMIT 1")).rows;
      await acceptSubmission(executor(db), actor, submission!.id);
      await expect(acceptSubmission(executor(db), actor, submission!.id)).rejects.toThrow(/already reviewed/u);
    } finally { await db.close(); }
  }, 60000);

  it("rejecting a submission records a reason and touches no facts", async () => {
    const db = await migratedDatabase();
    try {
      await fixtures(db);
      const [submission] = (await db.query<{ id: string }>("SELECT id FROM submissions LIMIT 1")).rows;
      await expect(rejectSubmission(executor(db), actor, submission!.id, {})).rejects.toThrow(/reason/i);
      await rejectSubmission(executor(db), actor, submission!.id, { reason: "no verifiable source" });
      const facts = await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM facts");
      expect(facts.rows[0]!.count).toBe(2);
      const audit = await listAuditRows(executor(db));
      expect(audit[0]).toMatchObject({ action: "submission.reject", reason: "no verifiable source" });
    } finally { await db.close(); }
  }, 60000);
});

describe("BATCH 13 — the audit log stays immutable through the real schema", () => {
  it("cannot be rewritten even with a direct UPDATE", async () => {
    const db = await migratedDatabase();
    try {
      await fixtures(db);
      await applyFactReview(executor(db), actor, "F-OBOUR-1", { action: "approve" });
      await expect(db.query("UPDATE admin_audit_log SET actor='hijacked'")).rejects.toThrow(/append-only/u);
      const audit = await listAuditRows(executor(db));
      expect(audit[0]!.actor).toBe("admin:test");
    } finally { await db.close(); }
  }, 60000);
});
