import { ASSETS, ITEMS } from "../shared/content.js";
import { HELD_TOOLS, paintHeldTool, type HeldTool } from "./tool-art.js";

const toolIcons = new Map<string, string>();

/** Bake once, with transparent padding trimmed so slim tools fill mobile slots.
 * The five held tools use their original painter; UI pixels never affect play. */
export function toolIconSource(id: string): string | undefined {
  if (id === "watering_can") id = "water";
  if (id === "hand") return ASSETS.item_hand?.source?.path;
  if (!HELD_TOOLS.includes(id as HeldTool) && id !== "fishing_rod") return;
  const cached = toolIcons.get(id);
  if (cached) return cached;
  const source = document.createElement("canvas");
  source.width = source.height = 64;
  const c = source.getContext("2d")!;
  if (id === "fishing_rod") {
    // Wooden rod, pale line, compact metal reel and hook in the held-tool palette.
    c.lineCap = "round";
    c.strokeStyle = "#563c29"; c.lineWidth = 5;
    c.beginPath(); c.moveTo(12,55); c.lineTo(39,7); c.stroke();
    c.strokeStyle = "#b58b50"; c.lineWidth = 3; c.stroke();
    c.strokeStyle = "#3c594e"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(39,7); c.lineTo(53,20); c.lineTo(53,49); c.arc(49,49,4,0,Math.PI); c.stroke();
    c.strokeStyle = "#c9dfb3"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(40,8); c.lineTo(52,20); c.lineTo(52,45); c.stroke();
    c.fillStyle = "#3c594e"; c.beginPath(); c.arc(27,39,7,0,Math.PI*2); c.fill();
    c.fillStyle = "#a9c3b6"; c.beginPath(); c.arc(27,39,4,0,Math.PI*2); c.fill();
    c.fillStyle = "#563c29"; c.fillRect(26,38,3,3); c.fillRect(30,42,6,3);
  } else paintHeldTool(c, id as HeldTool);
  const pixels = c.getImageData(0,0,64,64).data;
  let left = 64, top = 64, right = 0, bottom = 0;
  for (let y=0;y<64;y++) for (let x=0;x<64;x++) if (pixels[(y*64+x)*4+3]! > 8) {
    left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y);
  }
  const icon = document.createElement("canvas");
  icon.width = icon.height = 32;
  const ctx = icon.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const width=right-left+1, height=bottom-top+1, scale=28/Math.max(width,height);
  ctx.drawImage(source,left,top,width,height,Math.round((32-width*scale)/2),Math.round((32-height*scale)/2),Math.round(width*scale),Math.round(height*scale));
  const url = icon.toDataURL("image/png");
  toolIcons.set(id,url);
  return url;
}

export function itemIconSource(id: string): string | undefined {
  const tool = toolIconSource(id);
  if (tool) return tool;
  const source = ASSETS[ITEMS[id]?.assetId ?? id]?.source;
  return source?.kind === "image" ? source.path : undefined;
}

export function toolIconImage(id: string): HTMLImageElement | undefined {
  const src = toolIconSource(id);
  if (!src) return;
  const image = document.createElement("img");
  image.src = src;
  image.alt = "";
  image.className = "tool-icon";
  image.draggable = false;
  return image;
}
