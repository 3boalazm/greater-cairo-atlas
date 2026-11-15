import { afterEach, describe, expect, it } from "vitest";
import { parseSubmissionInput, listSubmissions, reviewSubmission } from "@/lib/atlas/submissions";
import { RequestValidationError, AdminUnauthorizedError } from "@/lib/errors";

const valid = { entity_code: "TRANSIT-METRO-L1", attribute: "operational_status", proposed_value: "operational", source_url: "https://example.org/source" };
const priorToken = process.env.ADMIN_IMPORT_TOKEN;
afterEach(() => { if (priorToken === undefined) delete process.env.ADMIN_IMPORT_TOKEN; else process.env.ADMIN_IMPORT_TOKEN = priorToken; });

describe("submission security and data separation", () => {
  it("accepts only plain text and a public HTTP(S) evidence URL", () => {
    expect(parseSubmissionInput(valid).source_url).toBe(valid.source_url);
    for (const source_url of ["javascript:alert(1)", "ftp://example.org/file", "https://user:secret@example.org", "not a URL"]) {
      expect(() => parseSubmissionInput({ ...valid, source_url })).toThrow(RequestValidationError);
    }
    for (const proposed_value of ["<script>alert(1)</script>", "hello\u0000world", " "]) {
      expect(() => parseSubmissionInput({ ...valid, proposed_value })).toThrow(RequestValidationError);
    }
    expect(() => parseSubmissionInput({ ...valid, note: "x".repeat(1001) })).toThrow(RequestValidationError);
    expect(() => parseSubmissionInput({ ...valid, email: "bad-address" })).toThrow(RequestValidationError);
  });

  it("rejects admin credentials in query strings and enforces Authorization header only", async () => {
    process.env.ADMIN_IMPORT_TOKEN = "a-long-test-token-that-is-at-least-32-characters";
    await expect(listSubmissions(new Request("https://atlas.example/api/admin/submissions?token=secret"))).rejects.toThrow(RequestValidationError);
    await expect(listSubmissions(new Request("https://atlas.example/api/admin/submissions"))).rejects.toThrow(AdminUnauthorizedError);
  });

  it("does not allow reviewer actions to write facts or change submission fields", async () => {
    process.env.ADMIN_IMPORT_TOKEN = "a-long-test-token-that-is-at-least-32-characters";
    const request = new Request("https://atlas.example/api/admin/submissions", { headers: { Authorization: `Bearer ${process.env.ADMIN_IMPORT_TOKEN}` } });
    await expect(reviewSubmission(request, "not-a-uuid", { status: "accepted" })).rejects.toThrow(RequestValidationError);
    await expect(reviewSubmission(request, "123e4567-e89b-12d3-a456-426614174000", { status: "pending", proposed_value: "overwrite facts" })).rejects.toThrow(RequestValidationError);
  });
});
