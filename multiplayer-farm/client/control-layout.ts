type Control = "joystick" | "action" | "run";
interface Placement {
  x: number;
  y: number;
  size: number;
  opacity: number;
}
type Layout = Record<Control, Placement>;
const KEY = "farm-controls-v1";
const ids: Control[] = ["joystick", "action", "run"];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export class ControlLayout {
  editing = false;
  private layout?: Layout;
  private before?: Layout;
  private selected: Control = "joystick";
  private panel: HTMLDivElement;
  private abort = new AbortController();
  private observer = new ResizeObserver(() => this.apply(!this.editing));
  private drag?: { id: Control; pointer: number; dx: number; dy: number };
  constructor(
    private notice: (s: string) => void,
    private pause: () => void,
  ) {
    try {
      const saved = JSON.parse(
        localStorage.getItem(KEY) ?? "null",
      ) as Layout | null;
      if (
        saved &&
        ids.every(
          (id) =>
            saved[id] &&
            (["x", "y", "size", "opacity"] as const).every(
              (key) =>
                typeof saved[id][key] === "number" &&
                Number.isFinite(saved[id][key]),
            ),
        )
      )
        this.layout = saved;
    } catch {}
    this.panel = document.createElement("div");
    this.panel.id = "control-editor";
    this.panel.hidden = true;
    this.panel.innerHTML =
      '<strong>조작 배치 편집</strong><small>원하는 버튼을 드래그하세요</small><label>선택 <select id="control-choice"><option value="joystick">조이스틱</option><option value="action">행동</option><option value="run">RUN</option></select></label><label>크기 <input id="control-size" type="range" min="48" max="180"></label><label>투명도 <input id="control-opacity" type="range" min="35" max="100"></label><div><button id="controls-save">저장</button><button id="controls-reset">기본값 복원</button><button id="controls-cancel">취소</button></div>';
    document.body.append(this.panel);
    const opts = { signal: this.abort.signal };
    for (const id of ids) {
      const e = this.element(id);
      e.addEventListener(
        "pointerdown",
        (ev) => {
          if (!this.editing) return;
          ev.preventDefault();
          ev.stopImmediatePropagation();
          this.selected = id;
          this.fields();
          const b = e.getBoundingClientRect();
          this.drag = {
            id,
            pointer: ev.pointerId,
            dx: ev.clientX - b.left,
            dy: ev.clientY - b.top,
          };
          e.setPointerCapture(ev.pointerId);
        },
        { ...opts, capture: true },
      );
      e.addEventListener(
        "pointermove",
        (ev) => {
          if (!this.editing || this.drag?.pointer !== ev.pointerId) return;
          ev.preventDefault();
          ev.stopImmediatePropagation();
          const p = this.layout![id],
            { w, h } = this.viewport();
          p.x = (ev.clientX - this.drag.dx + p.size / 2) / w;
          p.y = (ev.clientY - this.drag.dy + p.size / 2) / h;
          this.apply(false);
        },
        { ...opts, capture: true },
      );
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
        e.addEventListener(
          event,
          (ev) => {
            if (!this.editing) return;
            ev.stopImmediatePropagation();
            this.drag = undefined;
          },
          { ...opts, capture: true },
        );
    }
    const q = <T extends HTMLElement>(id: string) =>
      this.panel.querySelector<T>("#" + id)!;
    q<HTMLSelectElement>("control-choice").addEventListener(
      "change",
      () => {
        this.selected = q<HTMLSelectElement>("control-choice").value as Control;
        this.fields();
      },
      opts,
    );
    q<HTMLInputElement>("control-size").addEventListener(
      "input",
      () => {
        this.layout![this.selected].size = Number(
          q<HTMLInputElement>("control-size").value,
        );
        this.apply(false);
      },
      opts,
    );
    q<HTMLInputElement>("control-opacity").addEventListener(
      "input",
      () => {
        this.layout![this.selected].opacity =
          Number(q<HTMLInputElement>("control-opacity").value) / 100;
        this.apply(false);
      },
      opts,
    );
    q("controls-save").addEventListener(
      "click",
      () => {
        this.apply(true);
        localStorage.setItem(KEY, JSON.stringify(this.layout));
        this.close();
        this.notice("이 기기에 조작 배치를 저장했어요");
      },
      opts,
    );
    q("controls-reset").addEventListener(
      "click",
      () => {
        this.layout = this.defaults();
        this.fields();
        this.apply(true);
      },
      opts,
    );
    q("controls-cancel").addEventListener(
      "click",
      () => {
        this.layout = this.before;
        this.close();
        this.apply(true);
      },
      opts,
    );
    window.addEventListener("resize", () => this.apply(true), opts);
    window.visualViewport?.addEventListener(
      "resize",
      () => this.apply(true),
      opts,
    );
    for (const id of ["top", "toolbar"]) {
      const e = document.getElementById(id);
      if (e) this.observer.observe(e);
    }
    this.apply(true);
  }
  private element(id: Control) {
    return document.getElementById(id)!;
  }
  private viewport() {
    return {
      w: window.visualViewport?.width ?? innerWidth,
      h: window.visualViewport?.height ?? innerHeight,
    };
  }
  private defaults(): Layout {
    const { w, h } = this.viewport(),
      small = h < 450;
    return {
      joystick: {
        x: 76 / w,
        y: (h - 75) / h,
        size: small ? 100 : 116,
        opacity: 0.85,
      },
      action: { x: (w - 124) / w, y: (h - 68) / h, size: 79, opacity: 1 },
      run: { x: (w - 50) / w, y: (h - 57) / h, size: 59, opacity: 1 },
    };
  }
  private fields() {
    (this.panel.querySelector("#control-choice") as HTMLSelectElement).value =
      this.selected;
    (this.panel.querySelector("#control-size") as HTMLInputElement).value =
      String(this.layout![this.selected].size);
    (this.panel.querySelector("#control-opacity") as HTMLInputElement).value =
      String(this.layout![this.selected].opacity * 100);
  }
  apply(avoid = true): void {
    const { w, h } = this.viewport(),
      data = this.layout ?? this.defaults();
    const container = document.getElementById("controls")!,
      style = getComputedStyle(container),
      safe = {
        top: parseFloat(style.paddingTop) || 0,
        bottom: parseFloat(style.paddingBottom) || 0,
        left: parseFloat(style.paddingLeft) || 0,
        right: parseFloat(style.paddingRight) || 0,
      };
    const occupied = [
      document.getElementById("top"),
      document.getElementById("toolbar"),
    ]
      .filter((e): e is HTMLElement => !!e)
      .map((e) => e.getBoundingClientRect());
    for (const id of ids) {
      const p = data[id],
        size = clamp(
          p.size,
          48,
          Math.min(id === "joystick" ? 180 : 120, w - 24, h - 24),
        );
      let x = clamp(
          p.x * w - size / 2,
          8 + safe.left,
          w - size - 8 - safe.right,
        ),
        y = clamp(p.y * h - size / 2, 8 + safe.top, h - size - 8 - safe.bottom);
      const overlaps = (a: number, b: number) =>
        occupied.some(
          (r) =>
            a < r.right + 6 &&
            a + size > r.left - 6 &&
            b < r.bottom + 6 &&
            b + size > r.top - 6,
        );
      if (avoid && overlaps(x, y)) {
        let best = Infinity,
          bx = x,
          by = y;
        for (let yy = 8 + safe.top; yy <= h - size - 8 - safe.bottom; yy += 12)
          for (
            let xx = 8 + safe.left;
            xx <= w - size - 8 - safe.right;
            xx += 12
          ) {
            const d = (xx - x) ** 2 + (yy - y) ** 2;
            if (d < best && !overlaps(xx, yy)) {
              best = d;
              bx = xx;
              by = yy;
            }
          }
        x = bx;
        y = by;
      }
      const e = this.element(id);
      Object.assign(e.style, {
        position: "fixed",
        left: `${x}px`,
        top: `${y}px`,
        width: `${size}px`,
        height: `${size}px`,
        opacity: String(clamp(p.opacity, 0.35, 1)),
      });
      occupied.push({
        left: x,
        right: x + size,
        top: y,
        bottom: y + size,
      } as DOMRect);
      if (this.editing && this.layout) {
        p.x = (x + size / 2) / w;
        p.y = (y + size / 2) / h;
        p.size = size;
      }
      if (id === "joystick") {
        const knob = document.getElementById("knob")!;
        Object.assign(knob.style, {
          width: `${size * 0.4}px`,
          height: `${size * 0.4}px`,
          left: `${size * 0.28}px`,
          top: `${size * 0.28}px`,
        });
      }
    }
  }
  open(): void {
    this.pause();
    this.before = this.layout ? structuredClone(this.layout) : undefined;
    this.layout = this.layout ? structuredClone(this.layout) : this.defaults();
    this.editing = true;
    document.body.classList.add("editing-controls");
    this.panel.hidden = false;
    this.fields();
    this.apply(false);
  }
  private close() {
    this.editing = false;
    this.drag = undefined;
    this.panel.hidden = true;
    document.body.classList.remove("editing-controls");
    this.pause();
  }
  dispose() {
    this.abort.abort();
    this.observer.disconnect();
    this.panel.remove();
  }
}
