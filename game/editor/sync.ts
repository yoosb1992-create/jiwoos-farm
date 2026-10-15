export type DraftFreshness = "cloud-newer" | "local-newer" | "same";

export function compareDraftFreshness(localUpdatedAt: number, cloudUpdatedAt: number): DraftFreshness {
  if (cloudUpdatedAt > localUpdatedAt) return "cloud-newer";
  if (localUpdatedAt > cloudUpdatedAt) return "local-newer";
  return "same";
}

export function shouldAdoptCloudDraft(hasLocalDraft: boolean, localUpdatedAt: number, cloudUpdatedAt: number): boolean {
  return !hasLocalDraft || compareDraftFreshness(localUpdatedAt, cloudUpdatedAt) === "cloud-newer";
}
