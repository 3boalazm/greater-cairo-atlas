import type { AtlasTheme } from "./atlas-client";

export const OPENFREEMAP_STYLE_URLS: Record<AtlasTheme, string> = {
  night: "https://tiles.openfreemap.org/styles/dark",
  day: "https://tiles.openfreemap.org/styles/positron",
};

export function getAtlasMapStyleUrl(theme: AtlasTheme): string {
  return OPENFREEMAP_STYLE_URLS[theme];
}
