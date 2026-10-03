const encoder = new TextEncoder();

export const NATIVE_SESSION_COOKIE = "jiwoo_session";
export const NATIVE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 120_000;

export class NativeAuthError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export type NativeAuthDB = Pick<D1Database, "prepare" | "batch">;
export interface NativeUser { userId: string; displayName: string; }
interface NativeUserRow { user_id: string; display_name: string; password_salt: string; password_hash: string; }

const toHex = (bytes: Uint8Array) => Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => Uint8Array.from(value.match(/.{1,2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
const randomToken = (bytes = 32) => {
  const value = crypto.getRandomValues(new Uint8Array(bytes)); let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const nativePasswordError = (value: unknown): string | null =>
  typeof value !== "string" || [...value].length < 2 ? "비밀번호는 2자 이상이어야 합니다." : null;

export const normalizeNativeUsername = (value: unknown) => {
  if (typeof value !== "string") throw new NativeAuthError(400, "사용자 이름을 확인해 주세요.");
  const displayName = value.trim().normalize("NFKC"), length = [...displayName].length;
  if (!length || length > 40 || /[\u0000-\u001f\u007f]/.test(displayName)) throw new NativeAuthError(400, "사용자 이름은 1~40자로 입력해 주세요.");
  return { displayName, usernameKey: displayName.toLocaleLowerCase("ko-KR") };
};

async function sha256(value: string | Uint8Array) {
  const input = typeof value === "string" ? encoder.encode(value) : value;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}
async function derivePasswordHash(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey("raw", await sha256(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: PASSWORD_ITERATIONS }, key, 256);
  return toHex(new Uint8Array(bits));
}
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false; let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
};

export async function ensureNativeAuthStorage(db: NativeAuthDB) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS native_users (
      user_id TEXT PRIMARY KEY NOT NULL, username_key TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS native_sessions (
      session_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES native_users(user_id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS native_sessions_user ON native_sessions(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS native_sessions_expiry ON native_sessions(expires_at)"),
  ]);
}

export async function registerNativeUser(db: NativeAuthDB, rawUsername: unknown, rawPassword: unknown, now = Date.now()): Promise<NativeUser> {
  const { displayName, usernameKey } = normalizeNativeUsername(rawUsername);
  const error = nativePasswordError(rawPassword); if (error) throw new NativeAuthError(400, error);
  const password = rawPassword as string; await ensureNativeAuthStorage(db);
  if (await db.prepare("SELECT user_id FROM native_users WHERE username_key = ?").bind(usernameKey).first()) throw new NativeAuthError(409, "이미 사용 중인 사용자 이름입니다.");
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = await derivePasswordHash(password, salt);
  const userId = `native:${crypto.randomUUID()}`;
  try {
    await db.prepare("INSERT INTO native_users (user_id, username_key, display_name, password_salt, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(userId, usernameKey, displayName, salt, passwordHash, now, now).run();
  } catch (cause) {
    if (String(cause).includes("native_users.username_key")) throw new NativeAuthError(409, "이미 사용 중인 사용자 이름입니다.");
    throw cause;
  }
  return { userId, displayName };
}

export async function authenticateNativeUser(db: NativeAuthDB, rawUsername: unknown, rawPassword: unknown): Promise<NativeUser> {
  const { usernameKey } = normalizeNativeUsername(rawUsername);
  const error = nativePasswordError(rawPassword); if (error) throw new NativeAuthError(400, error);
  await ensureNativeAuthStorage(db);
  const row = await db.prepare("SELECT user_id, display_name, password_salt, password_hash FROM native_users WHERE username_key = ?")
    .bind(usernameKey).first<NativeUserRow>();
  if (!row) throw new NativeAuthError(401, "사용자 이름 또는 비밀번호가 올바르지 않습니다.");
  if (!safeEqual(await derivePasswordHash(rawPassword as string, row.password_salt), row.password_hash)) throw new NativeAuthError(401, "사용자 이름 또는 비밀번호가 올바르지 않습니다.");
  return { userId: row.user_id, displayName: row.display_name };
}

export async function createNativeSession(db: NativeAuthDB, userId: string, now = Date.now()) {
  await ensureNativeAuthStorage(db);
  const token = randomToken(), sessionHash = toHex(await sha256(token)), expiresAt = now + NATIVE_SESSION_TTL_MS;
  await db.prepare("DELETE FROM native_sessions WHERE expires_at <= ?").bind(now).run();
  await db.prepare("INSERT INTO native_sessions (session_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
    .bind(sessionHash, userId, now, expiresAt, now).run();
  return { token, expiresAt };
}
export async function findNativeSessionUser(db: NativeAuthDB, token: string, now = Date.now()): Promise<NativeUser | null> {
  if (!token) return null;
  const hash = toHex(await sha256(token));
  return await db.prepare(`SELECT u.user_id AS userId, u.display_name AS displayName
    FROM native_sessions s JOIN native_users u ON u.user_id = s.user_id
    WHERE s.session_hash = ? AND s.expires_at > ?`).bind(hash, now).first<NativeUser>();
}
export async function deleteNativeSession(db: NativeAuthDB, token: string) {
  if (!token) return;
  await db.prepare("DELETE FROM native_sessions WHERE session_hash = ?").bind(toHex(await sha256(token))).run();
}
export function readNativeSessionToken(cookieHeader: string | null) {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === NATIVE_SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}
export function nativeSessionCookie(token: string, requestUrl: string, maxAgeSeconds = Math.floor(NATIVE_SESSION_TTL_MS / 1000)) {
  const secure = new URL(requestUrl).protocol === "https:";
  return [`${NATIVE_SESSION_COOKIE}=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`, secure ? "Secure" : ""].filter(Boolean).join("; ");
}
export const clearNativeSessionCookie = (requestUrl: string) => nativeSessionCookie("", requestUrl, 0);
