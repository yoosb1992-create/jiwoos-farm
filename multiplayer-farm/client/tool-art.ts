/** The exact held-tool painter is shared by world textures and UI icons.
 * Moving it here changes no blade, grip, animation or timing. */
export const HELD_TOOLS = ["axe", "pickaxe", "hoe", "scythe", "water"] as const;
export type HeldTool = typeof HELD_TOOLS[number];
export function paintHeldTool(c: CanvasRenderingContext2D, tool: HeldTool): void {
  c.clearRect(0,0,64,64);
  c.lineCap="round";c.lineJoin="round";
  if(tool==="water") {
    c.strokeStyle="#3c594e";c.lineWidth=4;c.beginPath();c.arc(24,26,10,Math.PI,Math.PI*2);c.stroke();
    c.strokeStyle="#a5c7a6";c.lineWidth=2;c.stroke();
    c.fillStyle="#719d85";c.strokeStyle="#3c594e";c.lineWidth=2;
    c.beginPath();c.roundRect(12,28,30,24,5);c.moveTo(39,34);c.lineTo(58,25);c.lineTo(61,32);c.lineTo(40,46);c.closePath();c.fill();c.stroke();
    c.fillStyle="#c9dfb3";c.fillRect(16,31,3,15);c.fillStyle="#547a6d";c.fillRect(21,49,14,2);
    c.strokeStyle="#c6dcc2";c.lineWidth=4;c.beginPath();c.moveTo(56,24);c.lineTo(61,32);c.stroke();
    return;
  }
  c.strokeStyle="#563c29";c.lineWidth=5;c.beginPath();c.moveTo(25,55);c.lineTo(33,13);c.stroke();
  c.strokeStyle="#b58b50";c.lineWidth=3;c.stroke();
  // A compact blade and slim shaft fit the original farmer's small hands.
  // Only blade geometry changes; grip and spout anchors remain authored.
  c.save();c.translate(33,17);c.scale(.78,.78);c.translate(-33,-17);
  const metal=c.createLinearGradient(24,5,46,30);metal.addColorStop(0,"#e6f0df");metal.addColorStop(.5,"#a9c3b6");metal.addColorStop(1,"#57796d");
  c.fillStyle=metal;c.strokeStyle="#3c594e";c.lineWidth=2;
  c.beginPath();
  if(tool==="scythe") {c.moveTo(30,12);c.bezierCurveTo(47,0,62,14,53,37);c.bezierCurveTo(54,18,43,15,30,22);}
  else if(tool==="axe") {c.moveTo(30,9);c.lineTo(51,5);c.quadraticCurveTo(56,18,48,28);c.lineTo(30,21);}
  else if(tool==="pickaxe") {c.moveTo(10,25);c.quadraticCurveTo(31,-1,57,22);c.quadraticCurveTo(36,13,10,25);}
  else if(tool==="hoe") {c.moveTo(30,9);c.lineTo(51,12);c.lineTo(48,30);c.lineTo(37,27);c.lineTo(38,19);c.lineTo(30,18);}
  c.closePath();c.fill();c.stroke();
  c.restore();
  c.strokeStyle="#efd5a0";c.lineWidth=1;c.beginPath();c.moveTo(24,52);c.lineTo(30,27);c.stroke();
}
