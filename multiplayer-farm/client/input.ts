import {
  sanitizeMovementInput,
  type MovementInput,
} from "../shared/applyMovement.js";
import { JOYSTICK_DEADZONE } from "./config.js";

const MOVEMENT_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
]);

export class InputController {
  private readonly abort = new AbortController();
  private readonly keys = new Set<string>();
  private readonly runPointers = new Set<number>();
  private joystickPointer: number | null = null;
  private moveX = 0;
  private moveY = 0;

  constructor(
    private readonly joystick: HTMLElement,
    private readonly knob: HTMLElement,
    private readonly runButton: HTMLButtonElement,
  ) {
    const options = { signal: this.abort.signal };
    window.addEventListener(
      "keydown",
      (event) => {
        const target = event.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable)
        )
          return;
        if (!MOVEMENT_KEYS.has(event.code)) return;
        event.preventDefault();
        this.keys.add(event.code);
        this.updateRun();
      },
      options,
    );
    window.addEventListener(
      "keyup",
      (event) => {
        this.keys.delete(event.code);
        this.updateRun();
      },
      options,
    );
    window.addEventListener("blur", () => this.reset(), options);
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.reset();
      },
      options,
    );
    joystick.addEventListener(
      "pointerdown",
      (event) => {
        event.preventDefault();
        if (this.joystickPointer !== null) return;
        this.joystickPointer = event.pointerId;
        joystick.setPointerCapture(event.pointerId);
        this.moveJoystick(event);
      },
      options,
    );
    joystick.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId === this.joystickPointer) this.moveJoystick(event);
      },
      options,
    );
    const stopJoystick = (event: PointerEvent) => {
      if (event.pointerId !== this.joystickPointer) return;
      this.joystickPointer = null;
      this.moveX = this.moveY = 0;
      this.knob.style.transform = "translate(0, 0)";
    };
    joystick.addEventListener("pointerup", stopJoystick, options);
    joystick.addEventListener("pointercancel", stopJoystick, options);
    joystick.addEventListener("lostpointercapture", stopJoystick, options);
    runButton.addEventListener(
      "pointerdown",
      (event) => {
        event.preventDefault();
        this.runPointers.add(event.pointerId);
        runButton.setPointerCapture(event.pointerId);
        this.updateRun();
      },
      options,
    );
    const stopRun = (event: PointerEvent) => {
      this.runPointers.delete(event.pointerId);
      this.updateRun();
    };
    runButton.addEventListener("pointerup", stopRun, options);
    runButton.addEventListener("pointercancel", stopRun, options);
    runButton.addEventListener("lostpointercapture", stopRun, options);
    joystick.addEventListener(
      "contextmenu",
      (event) => event.preventDefault(),
      options,
    );
    runButton.addEventListener(
      "contextmenu",
      (event) => event.preventDefault(),
      options,
    );
  }

  private moveJoystick(event: PointerEvent): void {
    const bounds = this.joystick.getBoundingClientRect();
    const radius = Math.min(bounds.width, bounds.height) * 0.33;
    const dx = event.clientX - bounds.left - bounds.width / 2;
    const dy = event.clientY - bounds.top - bounds.height / 2;
    const length = Math.hypot(dx, dy);
    const strength = Math.min(1, length / radius);
    if (strength < JOYSTICK_DEADZONE) {
      this.moveX = this.moveY = 0;
    } else {
      this.moveX = (dx / length) * strength;
      this.moveY = (dy / length) * strength;
    }
    const distance = Math.min(radius, length);
    const scale = length > 0 ? distance / length : 0;
    this.knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  }

  read(): MovementInput {
    const x =
      Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) -
      Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    const y =
      Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) -
      Number(this.keys.has("KeyW") || this.keys.has("ArrowUp"));
    return sanitizeMovementInput({
      moveX: this.joystickPointer !== null ? this.moveX : x,
      moveY: this.joystickPointer !== null ? this.moveY : y,
      run:
        this.keys.has("ShiftLeft") ||
        this.keys.has("ShiftRight") ||
        this.runPointers.size > 0,
    });
  }

  private updateRun(): void {
    const running =
      this.keys.has("ShiftLeft") ||
      this.keys.has("ShiftRight") ||
      this.runPointers.size > 0;
    this.runButton.classList.toggle("active", running);
    this.runButton.setAttribute("aria-pressed", String(running));
  }

  reset(): void {
    this.keys.clear();
    const joystickPointer = this.joystickPointer;
    this.joystickPointer = null;
    if (
      joystickPointer !== null &&
      this.joystick.hasPointerCapture(joystickPointer)
    )
      this.joystick.releasePointerCapture(joystickPointer);
    for (const pointer of this.runPointers) {
      if (this.runButton.hasPointerCapture(pointer))
        this.runButton.releasePointerCapture(pointer);
    }
    this.runPointers.clear();
    this.moveX = this.moveY = 0;
    this.knob.style.transform = "translate(0, 0)";
    this.updateRun();
  }

  dispose(): void {
    this.reset();
    this.abort.abort();
  }
}
