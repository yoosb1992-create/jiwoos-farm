"use client";

import { useState } from "react";
import type { ItemAssetDefinition } from "@/game/assets/definitions";

/** DOM HUD icons share the asset definition, with the original glyph on load failure. */
export function ItemIcon({ asset, size = 28 }: { asset: ItemAssetDefinition; size?: number }) {
  const path = asset.source?.kind === "image" ? asset.source.path : null;
  const [failedPath, setFailedPath] = useState<string | null>(null);
  return <span aria-hidden="true" style={{ display: "inline-flex", width: size, height: size, flexShrink: 0, alignItems: "center", justifyContent: "center", verticalAlign: "middle" }}>
    {path && failedPath !== path
      // Raw img is intentional: tiny local pixel textures need error fallback and no resampling.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={path} alt="" width={size} height={size} draggable={false} style={{ imageRendering: "pixelated", objectFit: "contain" }} onError={() => setFailedPath(path)} />
      : asset.icon}
  </span>;
}
