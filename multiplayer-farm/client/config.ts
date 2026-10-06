/** Presentation-only settings; authoritative movement settings live in shared/config. */
export const CORRECTION_SMOOTH_MS = 65;
export const HUD_INTERVAL_MS = 200;
export const JOIN_TIMEOUT_MS = 12_000;
export const RECONNECT_MAX_RETRIES = 10;
export const RECONNECT_MAX_DELAY_MS = 2_000;
export const JOYSTICK_DEADZONE = 0.13;
export const GRID_SIZE = 40;

export function serverUrl(): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_SERVER_URL?.trim();
  if (!configured) {
    throw new Error(
      "VITE_MULTIPLAYER_SERVER_URL이 필요합니다. .env.example을 복사하고 서버 주소를 설정하세요.",
    );
  }
  const url = new URL(configured);
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("서버 주소는 WS 또는 WSS 프로토콜을 사용해야 합니다.");
  }
  if (window.location.protocol === "https:" && url.protocol !== "wss:") {
    throw new Error("HTTPS 화면에는 보안 WebSocket 주소가 필요합니다.");
  }
  return url.toString().replace(/\/$/, "");
}
