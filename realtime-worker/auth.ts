const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface DedicatedRealtimeClaims {
  aud: "jiwoos-farm-realtime-v1";
  roomId: string;
  playerId: string;
  nickname: string;
  sessionId: string;
  exp: number;
}

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlToBytes = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function sign(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

export async function issueDedicatedRealtimeToken(secret: string, claims: Omit<DedicatedRealtimeClaims, "aud">) {
  if (!secret || secret.length < 24) throw new Error("realtime auth secret is missing or too short");
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ aud: "jiwoos-farm-realtime-v1", ...claims } satisfies DedicatedRealtimeClaims)));
  const signature = bytesToBase64Url(await sign(secret, payload));
  return `${payload}.${signature}`;
}

export async function verifyDedicatedRealtimeToken(secret: string, token: string, now = Date.now()): Promise<DedicatedRealtimeClaims | null> {
  if (!secret || secret.length < 24 || typeof token !== "string" || token.length > 2048) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  try {
    const expected = bytesToBase64Url(await sign(secret, payload));
    if (expected.length !== signature.length) return null;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    if (mismatch !== 0) return null;
    const claims = JSON.parse(decoder.decode(base64UrlToBytes(payload))) as Partial<DedicatedRealtimeClaims>;
    if (
      claims.aud !== "jiwoos-farm-realtime-v1" ||
      typeof claims.roomId !== "string" || !claims.roomId ||
      typeof claims.playerId !== "string" || !claims.playerId ||
      typeof claims.nickname !== "string" || !claims.nickname ||
      typeof claims.sessionId !== "string" || !claims.sessionId ||
      !Number.isFinite(claims.exp) || Number(claims.exp) < now || Number(claims.exp) > now + 5 * 60_000
    ) return null;
    return claims as DedicatedRealtimeClaims;
  } catch {
    return null;
  }
}
