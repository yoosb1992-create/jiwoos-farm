/** Cardinal autotiling. No crop/soil schema changes, and no per-frame map scan. */
export const isTilled = (kind: string) => ["soil", "crop", "withered"].includes(kind);
type Plot = { area: string; x: number; y: number; kind: string };
const offsets = [[0,-1,1],[1,0,2],[0,1,4],[-1,0,8]] as const;
const keyAt = (area: string, x: number, y: number) => `${area}:${x},${y}`;
export class TilledGroundIndex {
  private plots = new Map<string, Plot>();
  private masks = new Map<string, number>();
  private revision = -1;
  private source?: object;
  private size = -1;
  sync(source: {size: number; forEach(fn: (e: Plot, id: string) => void): void}, revision: number): number {
    if (this.source === source && this.revision === revision && this.size === source.size) return 0;
    this.source = source; this.revision = revision; this.size = source.size;
    const next = new Map<string, Plot>(), dirty = new Map<string, Plot>();
    source.forEach(e => {
      if (!isTilled(e.kind)) return;
      const p = {area:e.area, x:Math.floor(e.x/32), y:Math.floor(e.y/32), kind:e.kind};
      const key = keyAt(p.area,p.x,p.y); next.set(key,p);
      if (!this.plots.has(key)) dirty.set(key,p);
    });
    for (const [key,p] of this.plots) if (!next.has(key)) dirty.set(key,p);
    this.plots = next;
    const affected = new Map(dirty);
    for (const p of dirty.values()) for (const [dx,dy] of offsets) {
      const neighbor = { ...p, x:p.x+dx, y:p.y+dy };
      affected.set(keyAt(p.area,neighbor.x,neighbor.y),neighbor);
    }
    for (const [key,p] of affected) {
      if (!next.has(key)) { this.masks.delete(key); continue; }
      let mask = 0;
      for (const [dx,dy,bit] of offsets) if (next.has(keyAt(p.area,p.x+dx,p.y+dy))) mask |= bit;
      this.masks.set(key,mask);
    }
    return affected.size;
  }
  mask(e: Pick<Plot,"area"|"x"|"y">): number {
    return this.masks.get(keyAt(e.area,Math.floor(e.x/32),Math.floor(e.y/32))) ?? 0;
  }
}

/** 32px original pixel soil: continuous interior, borders only at exposed edges. */
export function paintTilledGround(c: CanvasRenderingContext2D, mask: number): void {
  c.clearRect(0,0,32,32);
  c.fillStyle="#b48151"; c.fillRect(0,0,32,32);
  c.fillStyle="#bd8d5b";
  for(let y=5;y<32;y+=8)c.fillRect(0,y,32,2);
  c.fillStyle="#a87349";
  for(let y=7;y<32;y+=8)c.fillRect(0,y,32,1);
  c.fillStyle="#cca16b";
  for(const [x,y] of [[6,3],[23,12],[12,20],[28,29]])c.fillRect(x!,y!,2,1);
  c.fillStyle="#8a633e";
  if(!(mask&1))c.fillRect(0,0,32,2);
  if(!(mask&2))c.fillRect(30,0,2,32);
  if(!(mask&4))c.fillRect(0,30,32,2);
  if(!(mask&8))c.fillRect(0,0,2,32);
  c.fillStyle="#d4a473";
  if(!(mask&1))c.fillRect(2,2,28,1);
  if(!(mask&8))c.fillRect(2,3,1,26);
  // Inset only exposed corners: diagonal-only plots remain separate.
  for(const [x,y,a,b] of [[0,0,1,8],[30,0,1,2],[0,30,4,8],[30,30,4,2]])
    if(!(mask&a!) && !(mask&b!))c.clearRect(x!,y!,2,2);
}
