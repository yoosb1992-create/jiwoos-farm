import Phaser from "phaser";

/** Reuse the shipped farmer's exact face, hair, clothes and boots. The old tool
 * row contains a baked-in hoe, so it cannot be layered under another tool.
 * Four small masks are baked once; arms are articulated at runtime, not painted
 * into the ground or regenerated into a texture every animation frame. */
export function createFarmerParts(scene: Phaser.Scene): void {
  const source=scene.textures.get("player").getSourceImage() as HTMLImageElement;
  for(const [i,facing] of ["down","up","left","right"].entries()) {
    const side=i>=2;
    for(const part of ["head","torso","legs"] as const) {
      const key=`farmer-${facing}-${part}`;
      if(scene.textures.exists(key))continue;
      const t=scene.textures.createCanvas(key,48,72)!;
      const c=t.context;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,48,72);c.save();
      c.beginPath();
      if(part==="head") c.rect(0,0,48,44);
      else if(part==="torso") c.rect(side?19:17,44,side?11:14,15);
      else c.rect(side?17:16,58,side?14:16,14);
      c.clip();c.drawImage(source,i*4*48,0,48,72,0,0,48,72);
      if(side && part!=="head") {
        // The idle side view's near arm covers the shirt/hip. Reconstruct only
        // that narrow occluded strip from the outfit palette, under the new arm.
        const x=facing==="left"?25:19;
        c.fillStyle="#5b3726";c.fillRect(x,46,5,18);
        c.fillStyle="#85532e";c.fillRect(x+1,49,3,13);
        if(part==="torso"){c.fillStyle="#376024";c.fillRect(x,44,5,4);}
      }
      c.restore();t.refresh();t.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }
}
