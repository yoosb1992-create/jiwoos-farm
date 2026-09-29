export type MobileControlId = "joystick" | "run" | "action";
export type MobileOrientation = "portrait" | "landscape";
export interface MobileControlPlacement { x: number; y: number; size: number; opacity: number }
export type MobileControlProfile = Record<MobileControlId, MobileControlPlacement>;
export interface MobileControlSettings { version: 1; portrait: MobileControlProfile; landscape: MobileControlProfile }
export interface ViewportSize { width: number; height: number }
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void }

export const MOBILE_CONTROL_STORAGE_KEY = "jiwoos-farm.mobile-controls.v1";
export const MOBILE_CONTROL_LIMITS = { minSize: 70, maxSize: 140, minOpacity: 40, maxOpacity: 100 } as const;
export const mobileOrientation = ({ width, height }: ViewportSize): MobileOrientation => width > height ? "landscape" : "portrait";
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const baseSize = (id: MobileControlId, orientation: MobileOrientation) => id === "joystick" ? orientation === "landscape" ? 104 : 116 : 66;
const placement = (centerX: number, centerY: number, viewport: ViewportSize): MobileControlPlacement => ({
  x: centerX / viewport.width, y: centerY / viewport.height, size: 100, opacity: 100,
});

function defaultProfile(viewport: ViewportSize, orientation: MobileOrientation): MobileControlProfile {
  const actionBottom = orientation === "landscape" ? 82 : 134;
  const joystickBottom = orientation === "landscape" ? 12 : 90;
  const joystickSize = baseSize("joystick", orientation), buttonSize = baseSize("action", orientation);
  return {
    joystick: placement(14 + joystickSize / 2, viewport.height - joystickBottom - joystickSize / 2, viewport),
    run: placement(viewport.width - 91 - buttonSize / 2, viewport.height - actionBottom - buttonSize / 2, viewport),
    action: placement(viewport.width - 17 - buttonSize / 2, viewport.height - actionBottom - buttonSize / 2, viewport),
  };
}

export function defaultMobileControlSettings(viewport: ViewportSize): MobileControlSettings {
  const portrait = { width: Math.min(viewport.width, viewport.height), height: Math.max(viewport.width, viewport.height) };
  const landscape = { width: Math.max(viewport.width, viewport.height), height: Math.min(viewport.width, viewport.height) };
  return { version: 1, portrait: defaultProfile(portrait, "portrait"), landscape: defaultProfile(landscape, "landscape") };
}

export function clampMobileControlPlacement(id: MobileControlId, value: MobileControlPlacement, viewport: ViewportSize, margin = 8): MobileControlPlacement {
  const orientation = mobileOrientation(viewport);
  const size = clamp(Number.isFinite(value.size) ? value.size : 100, MOBILE_CONTROL_LIMITS.minSize, MOBILE_CONTROL_LIMITS.maxSize);
  const opacity = clamp(Number.isFinite(value.opacity) ? value.opacity : 100, MOBILE_CONTROL_LIMITS.minOpacity, MOBILE_CONTROL_LIMITS.maxOpacity);
  const half = baseSize(id, orientation) * size / 200;
  const minX = (half + margin) / viewport.width, maxX = 1 - minX;
  const minY = (half + margin) / viewport.height, maxY = 1 - minY;
  return { x: clamp(value.x, minX, maxX), y: clamp(value.y, minY, maxY), size, opacity };
}

export function clampMobileControlProfile(profile: MobileControlProfile, viewport: ViewportSize): MobileControlProfile {
  return {
    joystick: clampMobileControlPlacement("joystick", profile.joystick, viewport),
    run: clampMobileControlPlacement("run", profile.run, viewport),
    action: clampMobileControlPlacement("action", profile.action, viewport),
  };
}

function validPlacement(value: unknown): value is MobileControlPlacement {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<MobileControlPlacement>;
  return [entry.x, entry.y, entry.size, entry.opacity].every(Number.isFinite) &&
    entry.x! >= 0 && entry.x! <= 1 && entry.y! >= 0 && entry.y! <= 1 &&
    entry.size! >= MOBILE_CONTROL_LIMITS.minSize && entry.size! <= MOBILE_CONTROL_LIMITS.maxSize &&
    entry.opacity! >= MOBILE_CONTROL_LIMITS.minOpacity && entry.opacity! <= MOBILE_CONTROL_LIMITS.maxOpacity;
}

export function normalizeMobileControlSettings(value: unknown, viewport: ViewportSize): MobileControlSettings {
  const fallback = defaultMobileControlSettings(viewport);
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as { version?: unknown }).version !== 1) return fallback;
  const raw = value as Partial<MobileControlSettings>;
  for (const orientation of ["portrait", "landscape"] as const) {
    const profile = raw[orientation];
    if (!profile || !validPlacement(profile.joystick) || !validPlacement(profile.run) || !validPlacement(profile.action)) return fallback;
  }
  return { version: 1, portrait: { ...raw.portrait! }, landscape: { ...raw.landscape! } };
}

export function loadMobileControlSettings(storage: StorageLike, viewport: ViewportSize): MobileControlSettings {
  try { return normalizeMobileControlSettings(JSON.parse(storage.getItem(MOBILE_CONTROL_STORAGE_KEY) ?? "null"), viewport); }
  catch { return defaultMobileControlSettings(viewport); }
}
export function saveMobileControlSettings(storage: StorageLike, settings: MobileControlSettings): void {
  storage.setItem(MOBILE_CONTROL_STORAGE_KEY, JSON.stringify(settings));
}
export function resetMobileControlSettings(storage: StorageLike, viewport: ViewportSize): MobileControlSettings {
  storage.removeItem?.(MOBILE_CONTROL_STORAGE_KEY);
  return defaultMobileControlSettings(viewport);
}
export type RunPointerPhase = "down" | "up" | "cancel" | "lost-capture";
export const runHeldForPointerPhase = (phase: RunPointerPhase) => phase === "down";
