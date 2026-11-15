import { NextRequest, NextResponse } from "next/server";

const LOCALES = new Set(["ar", "en"]);
export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0];
  if (first && LOCALES.has(first)) {
    const internal = request.nextUrl.clone();
    const remainder = `/${parts.slice(1).join("/")}` || "/";
    internal.pathname = remainder === "/" ? "/" : remainder;
    internal.searchParams.set("lang", first);
    return NextResponse.rewrite(internal);
  }
  const legacyLanguage = searchParams.get("lang");
  const language = legacyLanguage === "en" ? "en" : "ar";
  const redirect = request.nextUrl.clone();
  redirect.pathname = `/${language}${pathname === "/" ? "" : pathname}`;
  redirect.searchParams.delete("lang");
  return NextResponse.redirect(redirect, 301);
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon\\.ico$|icon\\.svg$|robots\\.txt$|sitemap\\.xml$|.*\\.[^/]+$).*)"],
};
