import { ITEMS } from "./content.js";

/** Server-owned item definitions only. Clients cannot submit pickup bonuses. */
export interface PickupProfile {
  pickupRadius: number;
  magnetRadius: number;
  pickupDelayMs: number;
  spawnProtectionMs: number;
  /** Pixels per second for the committed attraction animation. */
  pickupSpeed: number;
  autoCollectPriority: number;
  reaction: "normal" | "rare";
}
export interface PickupEffect {
  radiusBonus?: number;
  speedMultiplier?: number;
}
export const DEFAULT_PICKUP_PROFILE: Readonly<PickupProfile> = Object.freeze({
  pickupRadius: 40, magnetRadius: 56, pickupDelayMs: 25,
  spawnProtectionMs: 240, pickupSpeed: 520, autoCollectPriority: 0, reaction: "normal",
});
export const PICKUP_SCAN_MS = 33;
export const PICKUP_RANGE_EPSILON = .001;
const bounded = (n: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.max(min, Math.min(max, n!)) : fallback;
/** Equipment/pet effects can later be resolved from durable member data here.
 * Use the same resolver for the spatial query, authority and presentation. */
export function itemPickupProfile(item = "", effect: PickupEffect = {}): PickupProfile {
  const d = DEFAULT_PICKUP_PROFILE, p = ITEMS[item]?.itemPickupProfile ?? {};
  const bonus = bounded(effect.radiusBonus, 0, 0, 128);
  const pickupRadius = bounded(p.pickupRadius, d.pickupRadius, 8, 192) + bonus;
  return {
    pickupRadius,
    magnetRadius: Math.max(pickupRadius, bounded(p.magnetRadius, d.magnetRadius, 8, 192) + bonus),
    pickupDelayMs: bounded(p.pickupDelayMs, d.pickupDelayMs, 0, 5000),
    spawnProtectionMs: bounded(p.spawnProtectionMs, d.spawnProtectionMs, 0, 10000),
    pickupSpeed: bounded(p.pickupSpeed, d.pickupSpeed, 80, 2000) * bounded(effect.speedMultiplier, 1, .25, 4),
    autoCollectPriority: bounded(p.autoCollectPriority, 0, -100, 100),
    reaction: p.reaction === "rare" ? "rare" : "normal",
  };
}
export const BASE_PICKUP_RADIUS = DEFAULT_PICKUP_PROFILE.pickupRadius;
export const DROP_SETTLE_MS = DEFAULT_PICKUP_PROFILE.spawnProtectionMs;
export const pickupRadius = (equipmentBonus = 0) => itemPickupProfile("", { radiusBonus: equipmentBonus }).pickupRadius;
export const pickupFlightMs = (distance: number, profile: PickupProfile) =>
  Math.max(90, Math.min(450, distance / profile.pickupSpeed * 1000));
