import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("locale path migration", () => {
  it("rewrites /ar and /en routes into the localized app request", () => {
    const arabic = proxy(new NextRequest("https://atlas.example/ar/entity/TEST-1"));
    const english = proxy(new NextRequest("https://atlas.example/en/entity/TEST-1"));
    expect(arabic.headers.get("x-middleware-rewrite")).toContain("/entity/TEST-1?lang=ar");
    expect(english.headers.get("x-middleware-rewrite")).toContain("/entity/TEST-1?lang=en");
  });
  it("permanently redirects legacy lang query URLs to locale paths", () => {
    const redirect = proxy(new NextRequest("https://atlas.example/entity/TEST-1?lang=en&entity=TEST-1"));
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe("https://atlas.example/en/entity/TEST-1?entity=TEST-1");
  });
});
