export const CAMERA_ZOOM_MIN = 0.75;
export const CAMERA_ZOOM_MAX = 2.25;
export const CAMERA_WHEEL_STEP = 0.1;

export const clampCameraZoom = (zoom: number) =>
  Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, zoom));

export const wheelCameraZoom = (current: number, deltaY: number) =>
  clampCameraZoom(current + (deltaY < 0 ? CAMERA_WHEEL_STEP : deltaY > 0 ? -CAMERA_WHEEL_STEP : 0));

export const pinchCameraZoom = (startZoom: number, startDistance: number, currentDistance: number) => {
  if (!Number.isFinite(startDistance) || startDistance <= 0 || !Number.isFinite(currentDistance)) return clampCameraZoom(startZoom);
  return clampCameraZoom(startZoom * currentDistance / startDistance);
};

export const pointerDistance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
