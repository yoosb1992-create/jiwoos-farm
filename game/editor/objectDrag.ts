import type { MapObjectDefinition } from "../maps/types";

export interface ObjectDragGrab {
  id: string;
  offsetX: number;
  offsetY: number;
}

export const beginObjectDrag = (object: MapObjectDefinition, pointer: { x: number; y: number }): ObjectDragGrab => ({
  id: object.id,
  offsetX: pointer.x - object.position.tileX,
  offsetY: pointer.y - object.position.tileY,
});

export const objectDragPosition = (grab: ObjectDragGrab, pointer: { x: number; y: number }, snap: (value: number) => number) => ({
  tileX: snap(pointer.x - grab.offsetX),
  tileY: snap(pointer.y - grab.offsetY),
});

/** Object collision is authored relative to position, so it moves automatically.
 * Interaction TileRects are absolute map coordinates and must receive the same
 * fractional delta as the object. */
export function moveMapObject(object: MapObjectDefinition, position: { tileX: number; tileY: number }) {
  const deltaX = position.tileX - object.position.tileX;
  const deltaY = position.tileY - object.position.tileY;
  object.position = { ...position };
  if (object.interaction && (deltaX || deltaY)) {
    object.interaction.area = {
      startX: object.interaction.area.startX + deltaX,
      endX: object.interaction.area.endX + deltaX,
      startY: object.interaction.area.startY + deltaY,
      endY: object.interaction.area.endY + deltaY,
    };
  }
}
