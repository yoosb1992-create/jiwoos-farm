import { FISH_CATALOG } from "../shared/expansion.js";
import {
  FISH_STEP_MS,
  fishingStep,
  newFishingFrame,
  type FishingChallenge,
} from "../shared/fishing.js";
export class FishingUI {
  private readonly abort = new AbortController();
  private frameId = 0;
  private held = false;
  private hookSent = false;
  private biteSound = false;
  private sent = false;
  private last = performance.now();
  private accumulated = 0;
  private readonly frame = newFishingFrame();
  private readonly inputs: number[] = [];
  constructor(
    parent: HTMLElement,
    private readonly challenge: FishingChallenge,
    private readonly clockOffset: number,
    private readonly onHook: () => void,
    private readonly onFinish: (inputs: number[]) => void,
    private readonly sound: (id: "bite" | "catch" | "fail") => void,
  ) {
    const f = FISH_CATALOG.find((f) => f.id === challenge.fishId)!;
    parent.innerHTML = `<div class="fishing-water"><div class="bobber">◉</div><p class="fish-status" role="status"></p></div><div class="fishing-game" ${challenge.startedAt ? "" : "hidden"}><div class="fish-track"><div class="catch-zone"></div><div class="fish-marker">◀</div><div class="depth-guide">수면<br><br><br><br>깊이</div></div><div class="fish-instructions"><span class="eyebrow">HOLD & RELEASE</span><h3>손끝의 물결</h3><p>누르면 초록 영역이 올라가요.<br>놓으면 천천히 내려가요.<br>물고기를 영역 안에 유지하세요.</p><label>잡아 올리기<progress max="1" value=".3"></progress></label><small class="fish-tension"></small></div></div><button class="fish-hold" aria-label="낚시 홀드">${challenge.startedAt ? "누르고 · 놓기" : "입질을 기다려요"}</button><p class="fish-tip">${challenge.startedAt ? `${f.rarity} 물고기 · 터치 홀드 또는 Space` : "찌가 흔들리면 3초 안에 챔질하세요."}</p>`;
    const b = parent.querySelector<HTMLButtonElement>(".fish-hold")!,
      status = parent.querySelector<HTMLElement>(".fish-status")!,
      zone = parent.querySelector<HTMLElement>(".catch-zone")!,
      marker = parent.querySelector<HTMLElement>(".fish-marker")!,
      bar = parent.querySelector<HTMLProgressElement>("progress")!,
      tension = parent.querySelector<HTMLElement>(".fish-tension")!;
    const options = { signal: this.abort.signal };
    const press = () => {
      if (challenge.startedAt) {
        this.held = true;
        b.classList.add("held");
      } else if (
        !this.hookSent &&
        Date.now() + clockOffset >= challenge.biteAt &&
        Date.now() + clockOffset <= challenge.expiresAt
      ) {
        this.hookSent = true;
        b.disabled = true;
        status.textContent = "물고기와 연결 중…";
        this.onHook();
      }
    };
    const release = () => {
      this.held = false;
      b.classList.remove("held");
    };
    b.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        press();
      },
      options,
    );
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      b.addEventListener(event, release, options);
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.code === "Space") {
          e.preventDefault();
          press();
        }
      },
      options,
    );
    window.addEventListener(
      "keyup",
      (e) => {
        if (e.code === "Space") release();
      },
      options,
    );
    window.addEventListener("blur", release, options);
    document.addEventListener("visibilitychange", release, options);
    const update = (now: number) => {
      if (this.sent) return;
      const serverNow = Date.now() + this.clockOffset;
      if (!challenge.startedAt) {
        const bite = serverNow >= challenge.biteAt,
          expired = serverNow > challenge.expiresAt;
        if (!this.hookSent) {
          status.textContent = expired
            ? "물고기가 떠났어요. 닫고 다시 던져 보세요."
            : bite
              ? "입질! 지금 챔질하세요!"
              : "물결 아래 누가 다가올까요…";
          b.textContent = expired
            ? "다음 물결을 기다려요"
            : bite
              ? "지금 챔질!"
              : "입질을 기다려요";
          b.disabled = expired || !bite;
        }
        parent
          .querySelector(".bobber")
          ?.classList.toggle("biting", bite && !expired);
        if (bite && !this.biteSound && !expired) {
          this.biteSound = true;
          this.sound("bite");
        }
      } else {
        this.accumulated += Math.min(200, now - this.last);
        while (this.accumulated >= FISH_STEP_MS && !this.frame.done) {
          this.accumulated -= FISH_STEP_MS;
          this.inputs.push(this.held ? 1 : 0);
          fishingStep(
            this.frame,
            this.held,
            challenge.seed,
            challenge.difficulty,
          );
        }
        zone.style.bottom = `${this.frame.cursor * 100}%`;
        zone.style.height = `${(0.36 - challenge.difficulty * 0.13) * 100}%`;
        marker.style.bottom = `${this.frame.fish * 100}%`;
        bar.value = this.frame.progress;
        tension.textContent =
          this.frame.tension > 0.6
            ? "물고기가 멀어져요. 짧게 눌러 따라가요!"
            : "좋아요. 힘을 조금씩 조절해요.";
        status.textContent = `남은 시간 ${Math.max(0, 20 - this.frame.tick / 20).toFixed(1)}초`;
        if (this.frame.done || serverNow > challenge.expiresAt) {
          this.sent = true;
          b.disabled = true;
          status.textContent = this.frame.won
            ? "낚싯줄을 끌어올리고 있어요…"
            : "물고기가 빠져나갔어요…";
          this.sound(this.frame.won ? "catch" : "fail");
          this.onFinish([...this.inputs]);
          return;
        }
      }
      this.last = now;
      this.frameId = requestAnimationFrame(update);
    };
    this.frameId = requestAnimationFrame(update);
  }
  dispose(): void {
    this.abort.abort();
    cancelAnimationFrame(this.frameId);
    this.held = false;
  }
}
