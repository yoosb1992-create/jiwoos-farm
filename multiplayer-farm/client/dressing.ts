export interface Dressing {
  asset: string;
  x: number;
  y: number;
  label?: string;
  scale?: number;
}
/** Decorative furnishings stay client-side; interactables are server entities. */
export function dressing(area: string): Dressing[] {
  const d: Dressing[] = [];
  const add = (asset: string, x: number, y: number, label = "", scale = 1) =>
    d.push({ asset, x: x * 32, y: y * 32, label, scale });
  if (area === "farm") {
    add("bridge", 27.5, 18, "", 1);
    add("decor_scarecrow", 18.8, 10.6);
    for (const [x, y] of [
      [3, 9],
      [9, 5.5],
      [10, 15.7],
      [14, 15.7],
      [18, 15.7],
      [23, 12.5],
      [32, 14.5],
      [31.8, 22],
      [35, 11.8],
      [43, 16],
    ])
      add("flower_bed", x!, y!, "", 0.64);
    for (const [x, y] of [
      [34, 10],
      [37, 10],
      [46, 10],
      [36, 16],
      [44, 16],
    ])
      add("green_shrub", x!, y!, "", 0.8);
    for (const x of [36.5, 39, 41.5, 44, 46.5])
      add("fence_horizontal", x, 16, "", 0.55);
    for (const y of [11, 13.5]) {
      add("fence_vertical", 36, y, "", 0.55);
      add("fence_vertical", 47, y, "", 0.55);
    }
    add("work_shed", 45, 7, "사계절 우리", 1.2);
    add("farm_crate", 37.2, 8.7, "", 0.8);
    add("bench", 31.7, 21.5);
    add("rustic_lamp", 29.5, 13.5);
    add("rustic_lamp", 26, 22);
    add("flowering_bush", 33, 23, "", 1.2);
    add("flowering_bush", 4, 17, "", 1.1);
  }
  if (area === "town") {
    add("house", 7, 4.6, "바람찻집", 0.75);
    add("work_shed", 33, 5.2, "나뭇결 공방", 1.5);
    add("house", 39, 4.2, "주민의 집", 0.65);
    add("house", 5, 15, "솔이네", 0.55);
    for (const x of [4, 11, 29, 36]) {
      add("flower_bed", x, 9, "", 0.8);
      add("rustic_lamp", x, 12.5);
    }
    add("stone_well", 15, 8);
    add("bench", 13, 13.8);
    add("bench", 20, 13.8);
    for (const x of [2, 12, 29, 42]) add("tree_variant_a", x, 5, "", 0.9);
    add("flowering_bush", 30, 15);
    add("flowering_bush", 39, 15.5);
  }
  if (area === "road") {
    for (const y of [3, 7, 11]) {
      add("flower_bed", 14, y, "", 0.55);
      add("tree_variant_a", 25, y, "", 0.9);
    }
    add("bench", 5.5, 11);
  }
  if (area === "forest") {
    for (const [x, y] of [
      [2, 3],
      [5, 2],
      [3, 11],
      [7, 15],
      [2, 17],
      [30, 22],
    ])
      add("tree_variant_b", x!, y!, "", 1.2);
    add("pond_rock_large", 6, 21, "", 0.8);
  }
  if (area === "coast") {
    add("bench", 10, 8);
    add("rustic_lamp", 13, 8);
    add("pond_rock_large", 3, 11);
    add("pond_rock_large", 28, 11);
    add("work_shed", 25, 5, "나루의 쉼터", 1);
    for (const x of [2, 5, 29]) add("green_shrub", x, 5, "", 0.7);
  }
  if (area === "cafe") {
    add("shop_counter", 6, 3);
    for (const x of [5, 12, 17]) {
      add("farm_crate", x, 8, "찻상", 1.2);
      add("bench", x, 9.5, "", 0.8);
      add("flower_bed", x, 2.5, "", 0.5);
    }
  }
  if (area === "workshop") {
    add("work_shed", 17, 4);
    add("farm_crate", 4, 4);
    add("storage_chest", 4, 8);
    add("wood_processor", 15, 8);
  }
  return d;
}
