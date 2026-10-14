import { outdoors } from "../shared/weather.js";
import type { Season } from "../shared/expansion.js";
export type Sound =
  | "swing" | "cut" | "soil" | "clunk" | "fall" | "breakStone" | "pickup"
  | "heavyWood" | "heavyFall"
  | "ore" | "swish"
  | "click"
  | "step"
  | "wood"
  | "stone"
  | "water"
  | "harvest"
  | "bite"
  | "catch"
  | "fail";
/** Original synthesized melodies and effects; no downloaded music or audio samples. */
export class FarmAudio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private ambience?: GainNode;
  private noise?: AudioBufferSourceNode;
  private filter?: BiquadFilterNode;
  private timer?: ReturnType<typeof setInterval>;
  private beat = 0;
  private nextNote = 0;
  private area = "farm";
  private season: Season = "spring";
  private weather = "clear";
  private night = false;
  private event = false;
  private voices = 0;
  private thunderBuffer?: AudioBuffer;
  private lastThunder = -Infinity;
  enabled = localStorage.getItem("farm-audio") !== "off";
  volume = Math.min(
    1,
    Math.max(0, Number(localStorage.getItem("farm-volume") ?? 0.3) || 0),
  );
  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      const buffer = this.ctx.createBuffer(
          1,
          this.ctx.sampleRate * 2,
          this.ctx.sampleRate,
        ),
        data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
        data[i] = last * 3;
      }
      this.noise = this.ctx.createBufferSource();
      this.noise.buffer = buffer;
      this.noise.loop = true;
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = "bandpass";
      this.filter.frequency.value = 650;
      this.filter.Q.value = 0.4;
      this.ambience = this.ctx.createGain();
      this.ambience.gain.value = 0.035;
      this.noise
        .connect(this.filter)
        .connect(this.ambience)
        .connect(this.master);
      this.noise.start();
      this.timer = setInterval(() => this.music(), 180);
    }
    if (this.ctx.state === "suspended")
      await this.ctx.resume().catch(() => undefined);
    this.apply();
  }
  setEnabled(value: boolean): void {
    this.enabled = value;
    localStorage.setItem("farm-audio", value ? "on" : "off");
    this.apply();
  }
  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    localStorage.setItem("farm-volume", String(this.volume));
    this.apply();
  }
  private apply(): void {
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(
        this.enabled && !document.hidden ? this.volume : 0,
        this.ctx.currentTime,
        0.12,
      );
  }
  context(
    area: string,
    season: Season,
    weather: string,
    minute: number,
    festival: boolean,
  ): void {
    this.area = area;
    this.season = season;
    this.weather = weather;
    this.night = minute >= 1140;
    this.event = festival;
    this.apply();
    if (this.ctx && this.ambience && this.filter) {
      this.ambience.gain.setTargetAtTime(
        weather === "rain" && outdoors(area)
          ? 0.2
          : area === "coast"
            ? 0.14
            : area === "forest"
              ? 0.075
              : 0.025,
        this.ctx.currentTime,
        1,
      );
      this.filter.frequency.setTargetAtTime(
        weather === "rain"
          ? 1700
          : area.startsWith("mine")
            ? 180
            : this.night
              ? 1100
              : 500,
        this.ctx.currentTime,
        1,
      );
    }
  }
  private tone(
    freq: number,
    duration: number,
    gain: number,
    type: OscillatorType = "sine",
    slide = 1,
  ): void {
    if (
      !this.ctx ||
      !this.master ||
      !this.enabled ||
      document.hidden ||
      this.voices > 14
    )
      return;
    const ctx = this.ctx,
      oscillator = ctx.createOscillator(),
      envelope = ctx.createGain(),
      now = ctx.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(30, freq * slide),
      now + duration,
    );
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope).connect(this.master);
    this.voices++;
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.voices--;
    };
    oscillator.start();
    oscillator.stop(now + duration + 0.03);
  }
  thunder(strength=.6, delayMs=0): void {
    const ctx=this.ctx, master=this.master;
    if(!ctx || !master || !this.enabled || document.hidden || !outdoors(this.area) || ctx.currentTime-this.lastThunder<8)return;
    this.lastThunder=ctx.currentTime;
    if(!this.thunderBuffer) {
      this.thunderBuffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*3.2),ctx.sampleRate);
      const data=this.thunderBuffer.getChannelData(0);let low=0;
      for(let i=0;i<data.length;i++){low=(low+(Math.random()*2-1)*.035)/1.035;data[i]=low*3.5;}
    }
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=this.thunderBuffer;filter.type="lowpass";filter.frequency.value=260;filter.Q.value=.5;
    const at=ctx.currentTime+Math.min(1.2,Math.max(0,delayMs/1000)), level=.16*Math.max(.2,Math.min(1,strength));
    gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.setValueAtTime(.0001,at);
    gain.gain.exponentialRampToValueAtTime(level,at+.35);
    gain.gain.exponentialRampToValueAtTime(level*.5,at+1.05);
    gain.gain.exponentialRampToValueAtTime(.0001,at+3);
    source.connect(filter).connect(gain).connect(master);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    source.start(at);source.stop(at+3.2);
  }
  play(sound: Sound): void {
    const effects: Record<
      Sound,
      [number, number, number, OscillatorType, number]
    > = {
      swing: [360, .09, .055, "triangle", .4],
      swish: [680, .12, .045, "sine", .32],
      ore: [830, .20, .065, "triangle", .48],
      cut: [1050, .11, .07, "triangle", .23],
      soil: [110, .12, .12, "triangle", .5],
      clunk: [125, .085, .095, "triangle", .6],
      fall: [70, .38, .16, "triangle", .45],
      breakStone: [380, .18, .085, "triangle", .18],
      pickup: [940, .13, .07, "sine", 1.65],
      heavyWood: [100, .19, .15, "triangle", .4],
      heavyFall: [58, .48, .18, "triangle", .52],
      click: [660, 0.06, 0.075, "sine", 1.2],
      step: [85, 0.065, 0.05, "triangle", 0.5],
      wood: [150, 0.14, 0.13, "triangle", 0.45],
      stone: [690, 0.15, 0.09, "square", 0.55],
      water: [900, 0.19, 0.07, "sine", 0.25],
      harvest: [740, 0.25, 0.11, "sine", 1.5],
      bite: [1174, 0.17, 0.11, "triangle", 1.25],
      catch: [784, 0.45, 0.12, "sine", 1.5],
      fail: [320, 0.3, 0.065, "triangle", 0.5],
    };
    this.tone(...effects[sound]);
  }
  private music(): void {
    if (!this.ctx || this.ctx.currentTime < this.nextNote) return;
    const mine = this.area.startsWith("mine"),
      town = ["town", "cafe", "workshop"].includes(this.area);
    const melody = this.event
      ? [0, 4, 7, 9, 7, 4, 2, 7, 12, 9, 7, 4]
      : mine
        ? [0, 7, 3, 10, 7, 3, 0, 5]
        : town
          ? [0, 4, 7, 4, 2, 5, 9, 7, 4, 2, 0, 7]
          : this.area === "forest"
            ? [0, 7, 9, 4, 7, 2, 4, 9, 12, 7, 4, 2]
            : [0, 4, 7, 9, 7, 4, 2, 0, 4, 7, 12, 9, 7, 4, 2, 7];
    const root =
      { spring: 261.63, summer: 293.66, autumn: 220, winter: 246.94 }[
        this.season
      ] * (mine || this.night ? 0.5 : 1);
    const interval = this.event
      ? 0.34
      : this.weather === "rain" || this.season === "winter"
        ? 0.68
        : 0.49;
    this.nextNote = this.ctx.currentTime + interval;
    const note = melody[this.beat % melody.length]!;
    if (this.beat % 4 !== 3 || this.event)
      this.tone(root * 2 ** (note / 12), interval * 1.8, 0.04, "sine");
    if (this.beat % 4 === 0)
      this.tone(root / 2, interval * 3, 0.022, "triangle");
    if ((this.area === "forest" || this.night) && this.beat % 13 === 0)
      this.tone(this.night ? 2400 : 1800, 0.14, 0.025, "sine", 1.2);
    this.beat++;
  }
  dispose(): void {
    clearInterval(this.timer);
    this.noise?.stop();
    this.noise?.disconnect();
    this.filter?.disconnect();
    this.ambience?.disconnect();
    this.master?.disconnect();
    void this.ctx?.close();
  }
}
