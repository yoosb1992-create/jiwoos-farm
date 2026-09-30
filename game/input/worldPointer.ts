/** Phaser also observes window-level mouse/touch events. HTML controls layered
 * over the game must never be interpreted as clicks on the game world. */
export const isGameCanvasPointerEvent = (
  eventTarget: EventTarget | null | undefined,
  canvas: EventTarget,
) => eventTarget === canvas;
