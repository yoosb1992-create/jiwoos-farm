import type { ToolKey } from "../events";
import type { Facing, PlayerAnimationDefinition } from "../assets/definitions";

export type ToolActionStyle = "swing" | "pour" | "reach" | "cast";

export type ToolEffectTiming =
  | { trigger: "start" }
  | { trigger: "frame"; frame: number }
  | { trigger: "complete" };

export type ToolActionDefinition = {
  style: ToolActionStyle;
  /** Gameplay remains start-triggered for Family compatibility. The animation
   * bridge also supports frame/complete when an authoritative contract changes. */
  effectTiming: ToolEffectTiming;
  /** Visual feedback is intentionally delayed until the contact pose. */
  visualCue: Extract<ToolEffectTiming, { trigger: "frame" }>;
  overlayFrame?: number;
  vfx: "soil" | "seed" | "water" | "sparkle" | "wood-hit" | "stone-hit" | "cast";
};

export const TOOL_ACTION_STYLES = ["swing", "pour", "reach", "cast"] as const satisfies readonly ToolActionStyle[];
export const TOOL_ACTION_FACINGS = ["down", "up", "left", "right"] as const satisfies readonly Facing[];

export const TOOL_ACTION_DEFINITIONS: Record<ToolKey, ToolActionDefinition> = {
  hoe: { style: "swing", effectTiming: { trigger: "start" }, visualCue: { trigger: "frame", frame: 2 }, overlayFrame: 0, vfx: "soil" },
  seed: { style: "reach", effectTiming: { trigger: "start" }, visualCue: { trigger: "frame", frame: 2 }, vfx: "seed" },
  water: { style: "pour", effectTiming: { trigger: "start" }, visualCue: { trigger: "frame", frame: 2 }, overlayFrame: 1, vfx: "water" },
  hand: { style: "reach", effectTiming: { trigger: "start" }, visualCue: { trigger: "frame", frame: 2 }, vfx: "sparkle" },
  axe: { style: "swing", effectTiming: { trigger: "start" }, visualCue: { trigger: "frame", frame: 2 }, overlayFrame: 2, vfx: "wood-hit" },
  pickaxe: { style: "swing", effectTiming: { trigger: "start" }, visualCue: { trigger: "frame", frame: 2 }, overlayFrame: 3, vfx: "stone-hit" },
  fishing_rod: { style: "cast", effectTiming: { trigger: "start" }, visualCue: { trigger: "frame", frame: 2 }, overlayFrame: 4, vfx: "cast" },
};

export type PlayerActionAnimationName = `action_${ToolActionStyle}_${Facing}`;

export const playerActionAnimationName = (style: ToolActionStyle, facing: Facing) =>
  `action_${style}_${facing}` as PlayerActionAnimationName;

const actionAnimations = Object.fromEntries(TOOL_ACTION_STYLES.flatMap((style, styleIndex) =>
  TOOL_ACTION_FACINGS.map((facing, facingIndex) => {
    const startFrame = styleIndex * 16 + facingIndex * 4;
    return [playerActionAnimationName(style, facing), { startFrame, endFrame: startFrame + 3, fps: 10, repeat: 0 }];
  }),
)) as Record<PlayerActionAnimationName, PlayerAnimationDefinition>;

export const PLAYER_ACTION_ASSET = {
  textureKey: "player-adult-actions",
  source: { kind: "spritesheet" as const, path: "/assets/inplay-polish/player/adult-farmer-actions.png", frameWidth: 48, frameHeight: 72 },
  frameSize: { width: 48, height: 72 },
  animations: actionAnimations,
} as const;

export const TOOL_OVERLAY_ASSET = {
  textureKey: "player-tool-overlays",
  source: { kind: "spritesheet" as const, path: "/assets/inplay-polish/tools/tool-overlays.png", frameWidth: 64, frameHeight: 64 },
  frameSize: { width: 64, height: 64 },
  frameCount: 5,
} as const;

export const shouldTriggerToolEffect = (timing: ToolEffectTiming, trigger: ToolEffectTiming["trigger"], frame?: number) =>
  timing.trigger === trigger && (timing.trigger !== "frame" || timing.frame === frame);
