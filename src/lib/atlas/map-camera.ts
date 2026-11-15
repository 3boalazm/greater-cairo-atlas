export interface MapRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface CameraPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Adds the measured panel occlusion to the relevant edge while retaining a clear margin elsewhere. */
export function getMapCameraPadding(
  mapRect: MapRect,
  panelRect: MapRect | null,
  margin: number,
): CameraPadding {
  const safeMargin = Math.max(0, margin);
  const padding: CameraPadding = { top: safeMargin, right: safeMargin, bottom: safeMargin, left: safeMargin };
  if (!panelRect || mapRect.width <= 0 || mapRect.height <= 0) return padding;

  const overlapWidth = Math.max(0, Math.min(mapRect.right, panelRect.right) - Math.max(mapRect.left, panelRect.left));
  const overlapHeight = Math.max(0, Math.min(mapRect.bottom, panelRect.bottom) - Math.max(mapRect.top, panelRect.top));
  if (overlapWidth === 0 || overlapHeight === 0) return padding;

  const isBottomSheet = panelRect.width >= mapRect.width * 0.8 && panelRect.bottom >= mapRect.bottom - 1;
  if (isBottomSheet) {
    padding.bottom += overlapHeight;
  } else if ((panelRect.left + panelRect.right) / 2 < (mapRect.left + mapRect.right) / 2) {
    padding.left += overlapWidth;
  } else {
    padding.right += overlapWidth;
  }
  return padding;
}
