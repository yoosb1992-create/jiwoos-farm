import { outdoors } from "../shared/weather.js";
import type { SunState } from "../shared/sunlight.js";

export function lightEnvironment(area: string): "outdoor" | "indoor" | "mine" {
  if (area.startsWith("mine")) return "mine";
  return outdoors(area) ? "outdoor" : "indoor";
}

/** Phaser corner order: top-left, top-right, bottom-left, bottom-right.
 * Multiplication preserves painted hues and never clips them to bright white.
 * Rotate the world light into the sprite's coordinates, not the camera's. */
export function objectSunTint(base: number, sun: SunState, rotation = 0): [number, number, number, number] {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  const x = sun.sunDirectionX * c + sun.sunDirectionY * s;
  const y = -sun.sunDirectionX * s + sun.sunDirectionY * c;
  const strength = (.1 + .18 * (1 - Math.max(0, sun.sunDirectionZ))) * Math.sqrt(sun.sunlightIntensity);
  const color = (sideX: number, sideY: number) => {
    const shade = Math.max(0, Math.min(1, 1 - strength * .65 + strength * (sideX * x + sideY * y * .35) * .65));
    const r = Math.round(((base >> 16) & 255) * shade);
    const g = Math.round(((base >> 8) & 255) * shade * (1 - sun.warmth * .035));
    const b = Math.round((base & 255) * shade * (1 - sun.warmth * .12));
    return (r << 16) | (g << 8) | b;
  };
  return [color(-1, -1), color(1, -1), color(-1, 1), color(1, 1)];
}

/** Only upright scenery receives the inexpensive sun response. Soil, seeds,
 * drops, actors and transport animations retain their existing sprite colors. */
export function receivesSunlight(asset: string, kind?: string): boolean {
  return ["tree", "stump", "rock", "well", "craft", "barn", "machine", "board"].includes(kind ?? "") ||
    /^(tree|house|store|work_shed|chicken_coop|stone_well|small_rock|farm_stone|decor_board|crafting_table|building)/.test(asset);
}

/** A bounded, soft ground ellipse rather than a silhouette/occlusion engine.
 * World Y is foreshortened for the existing 3/4 top-down art. */
export function groundShadow(sun: SunState, width: number, height: number) {
  const length = Math.min(150, height * .48 * sun.shadowLength);
  const x = sun.shadowDirectionX * length;
  const y = sun.shadowDirectionY * length * .5;
  return {
    x: x * .46, y: y * .46,
    width: Math.min(180, width * .52 + Math.abs(x)),
    height: Math.min(85, Math.max(8, width * .15) + Math.abs(y)),
    alpha: .22 * Math.sqrt(sun.sunlightIntensity),
  };
}

/** Outdoor atmosphere and object/seed lighting share SunState. Interior light
 * remains exactly as before until windows have authored positions/directions. */
export function atmosphereLight(area: string, minute: number, sun: SunState) {
  const environment = lightEnvironment(area);
  const legacyInterior = minute >= 1140 ? Math.min(.32, (minute - 1140) / 800) : minute < 420 ? .08 : 0;
  return {
    darkness: environment === "mine" ? .18 : environment === "indoor" ? legacyInterior : 1 - sun.ambientLight,
    darkColor: environment === "mine" ? 0x283043 : environment === "indoor" ? 0x263653 : 0x030711,
    // Screen blending lifts the painted midtones without replacing hue detail.
    daylightLift: environment === "outdoor" ? Math.sqrt(sun.sunlightIntensity) * ({spring:.12,summer:.22,autumn:.14,winter:.085}[sun.season]) : 0,
    daylightColor: {spring:0xfff1c6,summer:0xffefb0,autumn:0xffc78d,winter:0xdbeeff}[sun.season],
    warmth: environment === "outdoor" ? sun.warmth * .065 : 0,
    warmColor: sun.sunDirectionX >= 0 ? 0xffd894 : 0xffbd78,
  };
}
