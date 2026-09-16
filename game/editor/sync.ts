export type DraftFreshness = "cloud-newer" | "local-newer" | "same";

export function compareDraftFreshness(localUpdatedAt: number, cloudUpdatedAt: number): DraftFreshness {
  if (cloudUpdatedAt > localUpdatedAt) return "cloud-newer";
  if (localUpdatedAt > cloudUpdatedAt) return "local-newer";
  return "same";
}
