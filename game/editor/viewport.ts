export interface ViewportTransform { zoom: number; panX: number; panY: number }
export interface ScreenPoint { x: number; y: number }
export interface PinchStart extends ViewportTransform { distance: number; centerX: number; centerY: number }

export const clampEditorZoom = (zoom: number) => Math.max(.5, Math.min(4, zoom));

export function createPinchStart(a: ScreenPoint, b: ScreenPoint, viewport: ViewportTransform): PinchStart {
  return {
    ...viewport,
    distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    centerX: (a.x + b.x) / 2,
    centerY: (a.y + b.y) / 2,
  };
}

export function updatePinchViewport(start: PinchStart, a: ScreenPoint, b: ScreenPoint): ViewportTransform {
  const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  const centerX = (a.x + b.x) / 2, centerY = (a.y + b.y) / 2;
  return {
    zoom: clampEditorZoom(start.zoom * distance / start.distance),
    panX: start.panX + centerX - start.centerX,
    panY: start.panY + centerY - start.centerY,
  };
}
