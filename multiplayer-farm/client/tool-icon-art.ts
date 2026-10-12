/** Original 32px UI silhouettes. Never used by the held-tool animation painter. */
export const UI_TOOL_IDS = ["axe","pickaxe","hoe","scythe"] as const;
const colors={outline:"#4c483c",wood:"#a8753d",woodLight:"#dfb575",metal:"#9aaead",light:"#e6ede0",dark:"#687e80"};
export function paintToolIcon(c:CanvasRenderingContext2D,id:string):boolean {
  if(!(UI_TOOL_IDS as readonly string[]).includes(id))return false;
  c.clearRect(0,0,32,32);c.imageSmoothingEnabled=false;
  const rect=(x:number,y:number,w:number,h:number,color:string)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  const poly=(points:number[][],color:string)=>{
    c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x!,y!):c.moveTo(x!,y!));c.closePath();c.fill();
  };
  if(id==="axe") {
    // Thick handle with a single heavy wedge, broad cutting edge at the right.
    rect(10,5,6,25,colors.outline);rect(11,6,4,23,colors.wood);rect(11,17,1,11,colors.woodLight);
    poly([[8,5],[16,5],[23,2],[28,2],[29,6],[29,13],[27,17],[23,17],[17,12],[8,12]],colors.outline);
    poly([[10,7],[17,7],[24,4],[26,4],[27,7],[27,13],[25,15],[23,14],[17,10],[10,10]],colors.metal);
    poly([[24,4],[26,4],[27,7],[27,13],[25,15],[24,13]],colors.light);
    rect(10,8,5,2,colors.dark);rect(12,6,2,6,colors.woodLight);
  } else if(id==="pickaxe") {
    // Long vertical shaft; narrow, pointed metal head extending BOTH ways.
    rect(14,7,5,24,colors.outline);rect(15,9,3,20,colors.wood);rect(15,12,1,16,colors.woodLight);
    poly([[2,14],[3,10],[6,6],[11,4],[20,4],[26,7],[30,13],[29,15],[24,10],[20,9],[12,8],[7,10]],colors.outline);
    poly([[3,12],[7,7],[12,5],[20,5],[25,8],[28,12],[23,9],[19,7],[12,7],[7,9]],colors.metal);
    poly([[7,7],[12,5],[20,5],[23,7],[12,6]],colors.light);rect(14,6,5,4,colors.dark);
  } else if(id==="hoe") {
    // Offset right-angle neck and a broad FLAT downward blade, no pointed ends.
    rect(7,3,5,27,colors.outline);rect(8,4,3,24,colors.wood);rect(8,9,1,18,colors.woodLight);
    rect(10,4,15,4,colors.outline);rect(11,5,12,2,colors.metal);
    poly([[20,7],[28,7],[29,18],[26,22],[18,22],[19,18]],colors.outline);
    poly([[21,9],[26,9],[27,18],[25,20],[20,20],[21,17]],colors.metal);
    rect(20,18,7,2,colors.light);rect(23,9,3,8,colors.dark);
  } else {
    // Slim handle and an open crescent. The inner curve remains transparent.
    rect(6,17,4,13,colors.outline);rect(7,18,2,11,colors.wood);rect(7,20,1,8,colors.woodLight);
    poly([[5,18],[6,10],[10,5],[16,2],[23,3],[28,8],[30,15],[30,21],[27,15],[23,11],[18,9],[13,10],[10,13],[9,18]],colors.outline);
    poly([[7,17],[8,11],[12,6],[17,4],[22,5],[26,9],[28,15],[24,10],[18,7],[12,8],[9,13],[9,17]],colors.metal);
    poly([[12,6],[17,4],[22,5],[25,8],[21,6],[16,5],[11,8]],colors.light);
    rect(6,17,5,3,colors.dark);
  }
  return true;
}
