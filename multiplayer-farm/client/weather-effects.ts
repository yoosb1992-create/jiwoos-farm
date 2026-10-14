import type Phaser from "phaser";
import { RAIN, makeWeatherPlan, rainIntensity, outdoors, weatherRoll, type WeatherPlan, type WeatherEvent } from "../shared/weather.js";
import type { FarmState } from "../shared/schema.js";

export type LightningMode = "normal" | "reduced" | "off";
export const rainParticleCount = (width:number,height:number,density:number,budget=1) =>
  Math.min(width<600?200:280,Math.round(width*height/6500*density*Math.max(.45,Math.min(1,budget))));

/** One graphics batch and fixed typed arrays. No per-drop sprites, timers or
 * frame allocations. Positions are screen-local and independent of camera zoom. */
export class WeatherEffects {
  private particles = new Float32Array(280*3);
  private bolt = new Float32Array(18);
  private raw = "";
  private eventRaw: string | undefined;
  private flashAt = -Infinity;
  private lastEvent?: WeatherEvent;
  private budget = 1;
  private outdoors = true;
  plan: WeatherPlan = makeWeatherPlan(1,1,"clear");
  intensity = 0;
  cloudReduction = 0;
  particleCount = 0;
  lightningMode: LightningMode;
  constructor(private thunder: (event:WeatherEvent)=>void) {
    const saved=localStorage.getItem("farm-lightning");
    this.lightningMode=saved==="off"||saved==="reduced"||saved==="normal"?saved:
      matchMedia("(prefers-reduced-motion: reduce)").matches?"reduced":"normal";
    for(let i=0;i<280;i++) {
      this.particles[i*3]=weatherRoll(239,i*3+1);
      this.particles[i*3+1]=weatherRoll(239,i*3+2);
      this.particles[i*3+2]=.7+weatherRoll(239,i*3+3)*.6;
    }
  }
  resetSession():void { this.eventRaw=undefined;this.flashAt=-Infinity; }
  setLightningMode(mode:LightningMode):void {
    this.lightningMode=mode;localStorage.setItem("farm-lightning",mode);
    if(mode==="off")this.flashAt=-Infinity;
  }
  get label():string { return this.plan.kind!=="none" ? RAIN[this.plan.kind].name : this.plan.baseWeather==="snow"?"눈":"맑음"; }
  update(state:FarmState,area:string,connected:boolean,now:number,delta:number):void {
    if(this.raw!==state.weatherPlan || this.plan.day!==state.day || (!state.weatherPlan && this.plan.baseWeather!==state.weather)) {
      this.raw=state.weatherPlan;
      try { this.plan=this.raw?JSON.parse(this.raw):makeWeatherPlan(1,state.day,state.weather,"rain"); }
      catch { this.plan=makeWeatherPlan(1,state.day,state.weather,"rain"); }
    }
    this.outdoors=outdoors(area);
    const target=rainIntensity(this.plan,state.minute);
    const blend=1-Math.exp(-Math.min(250,delta)/450);
    this.intensity+=(target-this.intensity)*blend;
    const targetCloud=target*(this.plan.kind==="none"?0:RAIN[this.plan.kind].cloudReduction);
    this.cloudReduction+=(targetCloud-this.cloudReduction)*blend;
    // Slowly lower the particle budget on constrained phones, recover gradually.
    this.budget+=(delta>40?.5-this.budget:1-this.budget)*.008;
    if(!connected) {this.resetSession();return;}
    if(this.eventRaw===undefined) {this.eventRaw=state.weatherEvent;return;}
    if(this.eventRaw!==state.weatherEvent) {
      this.eventRaw=state.weatherEvent;
      if(!this.outdoors || document.hidden || !state.weatherEvent)return;
      try {
        const e:WeatherEvent=JSON.parse(state.weatherEvent);
        // Join/recovery/tab restoration never replays old thunder or lightning.
        if(e.day===state.day && state.minute>=e.minute && state.minute-e.minute<=4 && target>.1) {
          this.thunder(e);
          if(e.lightning && this.lightningMode!=="off")this.flash(e,now);
        }
      } catch { /* Ignore malformed presentation data; gameplay remains usable. */ }
    }
  }
  private flash(e:WeatherEvent,now:number):void {
    this.flashAt=now;this.lastEvent=e;
    const center=.18+weatherRoll(e.seed,2)*.64;
    for(let i=0;i<9;i++) {
      this.bolt[i*2]=center+(weatherRoll(e.seed,10+i)-.5)*.12;
      this.bolt[i*2+1]=-.03+i*.065;
    }
  }
  draw(g:Phaser.GameObjects.Graphics,w:number,h:number,now:number,ambient:number):void {
    this.particleCount=0;
    if(!this.outdoors)return;
    const profile=this.plan.kind==="none"?undefined:RAIN[this.plan.kind];
    if(profile && this.intensity>.015) {
      const count=this.particleCount=rainParticleCount(w,h,profile.density*this.intensity,this.budget);
      const light=.38+.62*Math.sqrt(Math.max(0,ambient));
      const angle=profile.angle+Math.cos(this.plan.windDirection*Math.PI/180)*this.plan.windSpeed*.025;
      const slope=angle+Math.sin(now/3200)*this.plan.gustStrength*.07;
      const length=profile.length*profile.size;
      g.lineStyle(profile.thickness,0xcfe8f6,profile.alpha*light*this.intensity).beginPath();
      for(let i=0;i<count;i++) {
        const speed=profile.speed*this.particles[i*3+2]!;
        const x=((this.particles[i*3]!*w+now*.001*speed*slope)%(w+80)+w+80)%(w+80)-40;
        const y=(this.particles[i*3+1]!*h+now*.001*speed)%(h+80)-40;
        g.moveTo(x,y);g.lineTo(x+slope*length,y+length);
      }
      g.strokePath();
      // Small, sparse heads make heavy drops legible without expensive sprites.
      if(profile.size>1) {
        g.fillStyle(0xdeeff8,.24*light*this.intensity);
        for(let i=0;i<count;i+=7) {
          const speed=profile.speed*this.particles[i*3+2]!;
          const x=((this.particles[i*3]!*w+now*.001*speed*slope)%(w+80)+w+80)%(w+80)-40;
          const y=(this.particles[i*3+1]!*h+now*.001*speed)%(h+80)-40;
          g.fillEllipse(x,y,profile.size,profile.size*2.5);
        }
      }
    }
    const age=now-this.flashAt;
    if(age>=0 && age<420 && this.lastEvent && this.lightningMode!=="off") {
      const envelope=Math.sin(Math.PI*age/420)**2;
      // One gentle pulse, never a repeated white strobe. Reduced mode omits wash.
      if(this.lightningMode==="normal")g.fillStyle(0xdde9ff,.065*envelope).fillRect(0,0,w,h);
      g.lineStyle(this.lightningMode==="normal"?2:1.2,0xe0eaff,envelope*(this.lightningMode==="normal"?.62:.28)).beginPath();
      for(let i=0;i<9;i++) {
        const x=this.bolt[i*2]!*w,y=this.bolt[i*2+1]!*h;
        if(i===0)g.moveTo(x,y);else g.lineTo(x,y);
      }
      g.strokePath();
    }
  }
}
