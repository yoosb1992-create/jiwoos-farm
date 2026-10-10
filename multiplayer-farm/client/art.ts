import type Phaser from "phaser";
import { CROPS, type MapData, TILE } from "../shared/content.js";
import { SEASON_INFO, FISH_CATALOG, type Season } from "../shared/expansion.js";
import { paintMaterial } from "./world/painted-materials.js";

// Original small painted details, generated once into textures. No per-frame canvas uploads.
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
function rng(seed: number) {
  let s = seed;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function ellipse(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}
function texture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  draw(t.context);
  t.refresh();
}
export function createContentTextures(scene: Phaser.Scene): void {
  // A 2x painted soil patch keeps furrows readable on phone zoom. Texture work
  // happens once at launch, never per plant or per animation frame.
  if (scene.textures.exists("terrain-art-soil"))
    for (const key of ["tile_farm_empty", "tile_farm_watered"]) {
      if (scene.textures.exists(key)) scene.textures.remove(key);
      texture(scene, key, 64, 64, c => {
        c.beginPath(); c.roundRect(1, 1, 62, 62, 7); c.clip();
        paintMaterial(c, "tilled_soil", 0, 0, 64, "spring", 173);
        for (const y of [17, 33, 49]) {
          c.strokeStyle = "#372a214f"; c.lineWidth = 3;
          c.beginPath(); c.moveTo(6, y); c.quadraticCurveTo(31, y + 3, 58, y); c.stroke();
          c.strokeStyle = "#e0ae6339"; c.lineWidth = 1;
          c.beginPath(); c.moveTo(6, y - 3); c.lineTo(58, y - 3); c.stroke();
        }
        if (key.endsWith("watered")) { c.fillStyle = "#344f583b"; c.fillRect(0, 0, 64, 64); }
      });
    }
  for (const crop of Object.values(CROPS))
    for (const stage of ["seed", "sprout", "growing", "mature"] as const) {
      const key = `crop_${crop.id}_${stage}`;
      if (scene.textures.exists(key)) continue;
      texture(scene, key, 40, 52, (c) => {
        ellipse(c, 20, 44, 16, 5, "#533c2b44");
        if (stage === "seed") {
          for (let i = 0; i < 3; i++)
            ellipse(c, 14 + i * 6, 41 + (i % 2), 2, 1.5, "#e1c69a");
          return;
        }
        const height = stage === "sprout" ? 10 : stage === "growing" ? 22 : 32;
        c.strokeStyle = "#55784a";
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(20, 44);
        c.lineTo(20, 44 - height);
        c.stroke();
        for (let i = 0; i < 4; i++) {
          c.save();
          c.translate(20, 40 - (i / 4) * height);
          c.rotate((i % 2 ? 1 : -1) * 0.55);
          ellipse(
            c,
            (i % 2 ? 1 : -1) * 6,
            -3,
            7,
            3,
            i % 2 ? "#7eaa54" : "#527949",
          );
          c.restore();
        }
        if (stage !== "mature") return;
        const col = hex(crop.color);
        if (crop.shape === "flower") {
          for (let i = 0; i < 7; i++)
            ellipse(
              c,
              20 + Math.cos(i * 0.9) * 8,
              16 + Math.sin(i * 0.9) * 8,
              5,
              5,
              col,
            );
          ellipse(c, 20, 16, 5, 5, "#795531");
          ellipse(c, 18, 14, 2, 2, "#e6bb64");
        } else if (crop.shape === "melon" || crop.shape === "leaf") {
          ellipse(c, 20, 32, 14, 12, col);
          c.strokeStyle = "#765e4155";
          c.lineWidth = 1;
          for (let i = 0; i < 4; i++) {
            c.beginPath();
            c.ellipse(20, 32, 3 + i * 3, 11, 0, 0, Math.PI * 2);
            c.stroke();
          }
        } else {
          for (let i = 0; i < (crop.shape === "berry" ? 5 : 3); i++) {
            const x = 12 + (i % 3) * 8,
              y = 25 + Math.floor(i / 3) * 10;
            ellipse(
              c,
              x,
              y,
              crop.shape === "corn" ? 4 : 5,
              crop.shape === "root" || crop.shape === "corn" ? 9 : 5,
              col,
            );
            ellipse(c, x - 1.5, y - 2, 1.5, 2, "#fff6d788");
          }
        }
      });
    }
  for (const f of FISH_CATALOG)
    texture(scene, `icon_${f.id}`, 36, 28, (c) => {
      c.fillStyle = f.color;
      c.beginPath();
      c.moveTo(24, 14);
      c.lineTo(35, 5);
      c.lineTo(35, 23);
      c.closePath();
      c.fill();
      ellipse(c, 16, 14, 12, 8, f.color);
      ellipse(c, 14, 11, 8, 3, "#eff9edaa");
      ellipse(c, 8, 13, 1.7, 1.7, "#263f3b");
      c.strokeStyle = "#456a6455";
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc(16 + i * 4, 15, 3, 1, 4);
        c.stroke();
      }
    });
  for (const species of ["cow", "sheep"] as const)
    texture(scene, `animal_${species}`, 70, 64, (c) => {
      ellipse(c, 34, 54, 29, 7, "#283d332e");
      for (const x of [18, 28, 45, 54]) {
        c.fillStyle = "#715f50";
        c.fillRect(x, 40, 5, 15);
        c.fillStyle = "#423e36";
        c.fillRect(x - 1, 51, 6, 4);
      }
      if (species === "sheep")
        for (let i = 0; i < 18; i++)
          ellipse(
            c,
            20 + (i % 5) * 7,
            25 + Math.floor(i / 5) * 6,
            8,
            7,
            i % 3 ? "#f0ecdb" : "#d9d7c5",
          );
      else {
        ellipse(c, 36, 33, 24, 16, "#ece8d7");
        ellipse(c, 38, 26, 9, 6, "#756456");
        ellipse(c, 49, 38, 8, 7, "#5c5149");
      }
      ellipse(c, 12, 32, 10, 12, species === "cow" ? "#eee6d6" : "#b2a391");
      ellipse(c, 5, 23, 5, 3, "#bda58c");
      ellipse(c, 21, 22, 5, 3, "#bda58c");
      ellipse(c, 10, 40, 8, 5, "#c49e92");
      ellipse(c, 8, 29, 1.8, 2, "#3c4138");
      ellipse(c, 16, 29, 1.8, 2, "#3c4138");
      if (species === "cow") {
        c.strokeStyle = "#ceba8d";
        c.lineWidth = 3;
        for (const x of [5, 20]) {
          c.beginPath();
          c.moveTo(x, 21);
          c.lineTo(x - 2, 15);
          c.stroke();
        }
      }
    });
  texture(scene, "decor_scarecrow", 50, 66, (c) => {
    c.fillStyle = "#81583a";
    c.fillRect(23, 25, 4, 38);
    c.fillRect(4, 30, 42, 4);
    c.fillStyle = "#87a48c";
    c.fillRect(14, 27, 24, 23);
    c.fillStyle = "#c9a267";
    c.fillRect(10, 19, 30, 5);
    c.fillRect(17, 10, 18, 11);
    ellipse(c, 25, 24, 7, 7, "#e4c696");
    c.fillStyle = "#ca7864";
    c.fillRect(15, 30, 22, 4);
    c.fillRect(30, 32, 5, 14);
    ellipse(c, 22, 23, 1, 1, "#59442e");
    ellipse(c, 28, 23, 1, 1, "#59442e");
  });
  texture(scene, "decor_board", 74, 86, (c) => {
    c.fillStyle = "#755438";
    c.fillRect(10, 42, 7, 42);
    c.fillRect(56, 42, 7, 42);
    c.fillRect(6, 17, 62, 48);
    c.fillStyle = "#c9ae78";
    c.fillRect(11, 23, 52, 36);
    c.fillStyle = "#a46448";
    c.beginPath();
    c.moveTo(1, 19);
    c.lineTo(37, 2);
    c.lineTo(73, 19);
    c.closePath();
    c.fill();
    for (let i = 0; i < 3; i++) {
      c.fillStyle = ["#fff5cf", "#dbebc8", "#edd0b9"][i]!;
      c.fillRect(15 + i * 15, 29, 12, 22);
      c.fillStyle = "#977957";
      c.fillRect(18 + i * 15, 34, 7, 1);
      c.fillRect(18 + i * 15, 39, 6, 1);
    }
  });
  texture(scene, "bridge", 48, 208, (c) => {
    c.fillStyle = "#7b5b3f";
    c.fillRect(6, 0, 36, 208);
    for (let y = 0; y < 208; y += 13) {
      c.fillStyle = y % 26 ? "#ba9968" : "#ccb080";
      c.fillRect(5, y + 1, 38, 11);
      c.fillStyle = "#927647";
      c.fillRect(13, y + 6, 20, 1);
    }
    c.fillStyle = "#66503c";
    c.fillRect(0, 0, 4, 208);
    c.fillRect(44, 0, 4, 208);
    for (let y = 0; y < 208; y += 40) {
      c.fillStyle = "#a38055";
      c.fillRect(0, y, 7, 12);
      c.fillRect(41, y, 7, 12);
    }
  });
  for (const key of ["bridge_wide", "reed", "water_lily", "mushroom"])
    texture(
      scene,
      key,
      key === "bridge_wide" ? 128 : 48,
      key === "bridge_wide" ? 160 : 64,
      (c) => {
        if (key === "bridge_wide") {
          c.fillStyle = "#b99463";
          c.fillRect(0, 0, 128, 160);
          c.strokeStyle = "#70563d";
          c.lineWidth = 4;
          for (let y = 0; y < 160; y += 14) {
            c.beginPath();
            c.moveTo(0, y);
            c.lineTo(128, y);
            c.stroke();
          }
          c.fillStyle = "#735739";
          c.fillRect(0, 0, 5, 160);
          c.fillRect(123, 0, 5, 160);
        } else if (key === "reed") {
          c.strokeStyle = "#778958";
          c.lineWidth = 3;
          for (let i = 0; i < 5; i++) {
            c.beginPath();
            c.moveTo(12 + i * 6, 58);
            c.lineTo(9 + i * 7, 15 + (i % 2) * 10);
            c.stroke();
            ellipse(c, 9 + i * 7, 15 + (i % 2) * 10, 2, 8, "#a49367");
          }
        } else if (key === "water_lily") {
          ellipse(c, 24, 45, 22, 10, "#73995e");
          for (let i = 0; i < 6; i++)
            ellipse(
              c,
              24 + Math.cos(i) * 6,
              39 + Math.sin(i) * 4,
              5,
              3,
              "#f3dad1",
            );
        } else {
          c.fillStyle = "#d8cfaf";
          c.fillRect(21, 34, 7, 20);
          ellipse(c, 24, 32, 16, 9, "#b96851");
          ellipse(c, 19, 29, 3, 2, "#f1d9ac");
        }
      },
    );
  for (const [key, variant] of [
    ["farm_twig_a", 0],
    ["farm_twig_b", 1],
  ] as const)
    texture(scene, key, 72, 44, (c) => {
      c.strokeStyle = variant ? "#7b5738" : "#8b6543";
      c.lineWidth = variant ? 6 : 5;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(10, 31);
      c.quadraticCurveTo(35, 15 + variant * 4, 62, 25);
      c.stroke();
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(34, 22);
      c.lineTo(27, 10 + variant * 3);
      c.moveTo(46, 21);
      c.lineTo(54, 9 + variant * 4);
      c.stroke();
      ellipse(c, 35, 34, 26, 5, "#2d3f3028");
    });
  for (const [key, variant] of [
    ["farm_stone_a", 0],
    ["farm_stone_b", 1],
  ] as const)
    texture(scene, key, 64, 50, (c) => {
      ellipse(c, 32, 42, 24, 5, "#2d3f3028");
      c.fillStyle = variant ? "#87928b" : "#9a9d91";
      c.beginPath();
      c.moveTo(12, 37);
      c.lineTo(18, 19);
      c.lineTo(36, 10 + variant * 4);
      c.lineTo(53, 23);
      c.lineTo(50, 38);
      c.closePath();
      c.fill();
      c.fillStyle = "#c7c8b7aa";
      c.beginPath();
      c.moveTo(19, 21);
      c.lineTo(35, 13 + variant * 4);
      c.lineTo(31, 26);
      c.closePath();
      c.fill();
      ellipse(c, 19 + variant * 6, 31, 7, 4, "#6f8068");
    });
  texture(scene, "farm_weed", 56, 52, (c) => {
    c.strokeStyle = "#668255";
    c.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.moveTo(28, 46);
      c.quadraticCurveTo(18 + i * 4, 30 - (i % 2) * 8, 12 + i * 7, 14 + (i % 3) * 6);
      c.stroke();
    }
    ellipse(c, 28, 47, 18, 4, "#2d3f3022");
  });
  texture(scene, "farm_wildflower", 64, 56, (c) => {
    c.strokeStyle = "#668255";
    c.lineWidth = 2.5;
    for (let i = 0; i < 5; i++) {
      const x = 14 + i * 9, y = 18 + (i % 2) * 7;
      c.beginPath();
      c.moveTo(32, 49);
      c.lineTo(x, y + 8);
      c.stroke();
      for (let p = 0; p < 5; p++)
        ellipse(c, x + Math.cos(p * 1.256) * 4, y + Math.sin(p * 1.256) * 4, 3, 2.2, i % 2 ? "#f4d0d7" : "#f5edc8");
      ellipse(c, x, y, 1.5, 1.5, "#d9b85f");
    }
    ellipse(c, 32, 50, 18, 4, "#2d3f3022");
  });
  for (const [key, color] of [
    ["milk", "#e8eee2"],
    ["wool", "#efe6d2"],
    ["tea", "#98ad73"],
    ["stew", "#ddaf69"],
    ["jam", "#c67482"],
  ] as const)
    texture(scene, `icon_${key}`, 32, 36, (c) => {
      ellipse(c, 16, 30, 12, 4, "#3e4e342a");
      c.fillStyle = color;
      c.beginPath();
      c.roundRect(6, 7, 20, 22, 5);
      c.fill();
      c.fillStyle = "#ad8b5b";
      c.fillRect(9, 4, 14, 5);
      c.fillStyle = "#fff7dfaa";
      c.fillRect(10, 13, 12, 8);
    });
}

export function createGround(
  scene: Phaser.Scene,
  map: MapData,
  season: Season,
): string {
  const key = "farm26-ground";
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const w = map.width * TILE,
    h = map.height * TILE;
  const t = scene.textures.createCanvas(key, w, h)!;
  const c = t.context,
    r = rng(719 + w + h);
  const mine = map.id.startsWith("mine"),
    indoor = ["cafe", "workshop", "farmhouse", "general_store"].includes(
      map.id,
    );
  c.fillStyle = mine
    ? "#687178"
    : indoor
      ? "#bfa382"
      : map.id === "coast"
        ? "#dacead"
        : hex(SEASON_INFO[season].grass);
  c.fillRect(0, 0, w, h);
  if (!mine && !indoor)
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      c.save(); c.translate(x * TILE, y * TILE);
      paintMaterial(c, map.id === "coast" ? "beach_sand" : "grass", x, y, TILE, season, 173);
      c.restore();
    }
  for (let i = 0; i < (indoor ? 1000 : 7500); i++) {
    const x = r() * w,
      y = r() * h;
    c.fillStyle = i % 3 ? "#fff8cf0e" : "#364c3020";
    c.fillRect(x, y, 2 + r() * 6, 1 + r() * 2);
  }
  if (indoor) {
    c.strokeStyle = "#866b5059";
    c.lineWidth = 1;
    for (let y = 0; y < h; y += 24) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
      for (let x = y % 48 ? 0 : 40; x < w; x += 80) c.strokeRect(x, y, 80, 24);
    }
  }
  for (const region of [
    ...map.terrainRegions,
    ...map.farmAreas.map((f) => ({ ...f, tileType: "farm" })),
  ]) {
    const x = region.startX * TILE,
      y = region.startY * TILE,
      rw = (region.endX - region.startX + 1) * TILE,
      rh = (region.endY - region.startY + 1) * TILE;
    c.fillStyle = region.tileType === "water" ? "#6c92937a" : "#5c613331";
    c.beginPath();
    c.roundRect(x - 5, y - 5, rw + 10, rh + 10, 12);
    c.fill();
    const gradient = c.createLinearGradient(x, y, x + rw, y + rh);
    const colors =
      region.tileType === "water"
        ? season === "winter"
          ? ["#b3d9dd", "#83b0c3"]
          : ["#9accb4", "#5396a3"]
        : region.tileType === "farm"
          ? ["#b48c60", "#98754d"]
          : region.tileType === "stone_floor"
            ? ["#d6c9ad", "#bfb396"]
            : ["#d6bd89", "#c7ac75"];
    gradient.addColorStop(0, colors[0]!);
    gradient.addColorStop(1, colors[1]!);
    c.fillStyle = gradient;
    c.fillRect(x, y, rw, rh);
    const material = region.tileType === "water" ? "water" : region.tileType === "farm"
      ? "tilled_soil" : region.tileType === "stone_floor" ? "stone_path" : "dirt_path";
    for (let ty = region.startY; ty <= region.endY; ty++)
      for (let tx = region.startX; tx <= region.endX; tx++) {
        c.save(); c.translate(tx * TILE, ty * TILE);
        paintMaterial(c, material, tx, ty, TILE, season, 173); c.restore();
      }
    if (region.tileType === "water") {
      c.strokeStyle = "#deefd56b";
      c.lineWidth = 2;
      for (let i = 0; i < 65; i++) {
        const px = x + r() * (rw - 20),
          py = y + r() * rh;
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(px + 5 + r() * 16, py);
        c.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const px = x + r() * rw,
          py = y + r() * rh;
        ellipse(c, px, py, 7, 4, "#7aa57b");
        if (i % 3 === 0) ellipse(c, px, py - 2, 3, 2, "#f2d4c5");
      }
    } else if (region.tileType === "farm") {
      for (let row = y; row < y + rh; row += TILE)
        for (let col = x; col < x + rw; col += TILE) {
          c.strokeStyle = "#75563277";
          c.strokeRect(col + 2, row + 3, 28, 26);
          c.fillStyle = "#d8b48544";
          c.fillRect(col + 5, row + 7, 21, 2);
          c.fillRect(col + 5, row + 16, 21, 2);
        }
    } else
      for (let i = 0; i < (rw * rh) / 250; i++) {
        c.fillStyle = i % 2 ? "#e9d6ad77" : "#a6906644";
        const px = x + r() * (rw - 8),
          py = y + r() * (rh - 4);
        c.beginPath();
        c.roundRect(px, py, region.tileType === "stone_floor" ? 13 : 5, 4, 2);
        c.fill();
      }
  }
  if (!mine && !indoor) {
    for (let i = 0; i < 550; i++) {
      const x = r() * w,
        y = r() * h,
        tx = x / TILE,
        ty = y / TILE;
      if (
        [...map.terrainRegions, ...map.farmAreas].some(
          (a) =>
            tx >= a.startX - 0.3 &&
            tx <= a.endX + 1.3 &&
            ty >= a.startY - 0.3 &&
            ty <= a.endY + 1.3,
        )
      )
        continue;
      c.fillStyle = season === "winter" ? "#f6ffff77" : "#507d3e55";
      c.fillRect(x, y, 1, 4);
      c.fillRect(x + 3, y - 2, 1, 5);
      if (i % 3 === 0) {
        ellipse(c, x + 2, y - 2, 2.7, 2, hex(SEASON_INFO[season].flower));
        ellipse(c, x + 2, y - 2, 0.7, 0.7, "#ffe8ad");
      }
    }
    const shade = c.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, "#33472e25");
    shade.addColorStop(0.3, "#ffffff00");
    shade.addColorStop(1, "#33472e12");
    c.fillStyle = shade;
    c.fillRect(0, 0, w, h);
  }
  t.refresh();
  return key;
}
