const encoder = new TextEncoder();

export const FARM_SESSION_COOKIE = "jiwoos_farm_session";
export const FARM_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const FARM_PASSWORD_ITERATIONS = 210_000;

export interface FarmSessionUser {
  accountId: string;
  userId: string;
  loginName: string;
  displayName: string;
}

export class FarmAuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const bytesToHex = (value: Uint8Array) =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");

const randomHex = (bytes: number) => {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToHex(value);
};

const sha256Hex = async (value: string) =>
  bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));

const pbkdf2Hex = async (password: string, saltHex: string, iterations: number) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
};

const constantTimeTextEqual = (left: string, right: string) => {
  let mismatch = left.length ^ right.length;
  const size = Math.max(left.length, right.length);
  for (let index = 0; index < size; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
};

export const farmPasswordError = (password: string): string | null =>
  Array.from(password).length < 2 ? "비밀번호는 2글자 이상 입력해 주세요." : null;

export const normalizeFarmLoginName = (value: string) => value.trim().toLocaleLowerCase("ko-KR");

export const farmLoginNameError = (value: string): string | null => {
  const normalized = normalizeFarmLoginName(value);
  const length = Array.from(normalized).length;
  if (length < 2 || length > 32) return "계정 이름은 2~32글자로 입력해 주세요.";
  if (!/^[\p{L}\p{N}._-]+$/u.test(normalized)) return "계정 이름에는 글자, 숫자, ., _, -만 사용할 수 있습니다.";
  return null;
};

export const farmDisplayNameError = (value: string): string | null => {
  const length = Array.from(value.trim()).length;
  return length < 1 || length > 20 ? "표시 이름은 1~20글자로 입력해 주세요." : null;
};

export async function createFarmAccount(
  db: D1Database,
  loginName: string,
  displayName: string,
  password: string,
): Promise<FarmSessionUser> {
  const loginError = farmLoginNameError(loginName);
  if (loginError) throw new FarmAuthError(400, loginError);
  const displayError = farmDisplayNameError(displayName);
  if (displayError) throw new FarmAuthError(400, displayError);
  const passwordError = farmPasswordError(password);
  if (passwordError) throw new FarmAuthError(400, passwordError);

  const normalizedLogin = normalizeFarmLoginName(loginName);
  const existing = await db.prepare("SELECT id FROM farm_accounts WHERE login_name = ? COLLATE NOCASE")
    .bind(normalizedLogin).first<{ id: string }>();
  if (existing) throw new FarmAuthError(409, "이미 사용 중인 계정 이름입니다.");

  const accountId = crypto.randomUUID();
  const salt = randomHex(16);
  const passwordHash = await pbkdf2Hex(password, salt, FARM_PASSWORD_ITERATIONS);
  const now = Date.now();
  await db.prepare(
    "INSERT INTO farm_accounts (id, login_name, display_name, password_salt, password_hash, password_iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(accountId, normalizedLogin, displayName.trim(), salt, passwordHash, FARM_PASSWORD_ITERATIONS, now, now).run();

  return {
    accountId,
    userId: "farm:" + accountId,
    loginName: normalizedLogin,
    displayName: displayName.trim(),
  };
}

export async function authenticateFarmAccount(
  db: D1Database,
  loginName: string,
  password: string,
): Promise<FarmSessionUser> {
  const normalizedLogin = normalizeFarmLoginName(loginName);
  const row = await db.prepare(
    "SELECT id, login_name AS loginName, display_name AS displayName, password_salt AS passwordSalt, password_hash AS passwordHash, password_iterations AS passwordIterations FROM farm_accounts WHERE login_name = ? COLLATE NOCASE",
  ).bind(normalizedLogin).first<{
    id: string;
    loginName: string;
    displayName: string;
    passwordSalt: string;
    passwordHash: string;
    passwordIterations: number;
  }>();

  if (!row) throw new FarmAuthError(401, "계정 이름 또는 비밀번호가 올바르지 않습니다.");
  const passwordHash = await pbkdf2Hex(password, row.passwordSalt, row.passwordIterations);
  if (!constantTimeTextEqual(passwordHash, row.passwordHash)) {
    throw new FarmAuthError(401, "계정 이름 또는 비밀번호가 올바르지 않습니다.");
  }

  return {
    accountId: row.id,
    userId: "farm:" + row.id,
    loginName: row.loginName,
    displayName: row.displayName,
  };
}

export async function createFarmSession(db: D1Database, accountId: string) {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const expiresAt = now + FARM_SESSION_TTL_SECONDS * 1000;
  await db.prepare(
    "INSERT INTO farm_sessions (token_hash, account_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(tokenHash, accountId, expiresAt, now, now).run();
  return { token, expiresAt };
}

const cookieValue = (cookieHeader: string | null, name: string) => {
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(entry.slice(separator + 1).trim());
  }
  return null;
};

export async function readFarmSession(db: D1Database, cookieHeader: string | null): Promise<FarmSessionUser | null> {
  const token = cookieValue(cookieHeader, FARM_SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(
    "SELECT s.expires_at AS expiresAt, a.id AS accountId, a.login_name AS loginName, a.display_name AS displayName FROM farm_sessions s JOIN farm_accounts a ON a.id = s.account_id WHERE s.token_hash = ?",
  ).bind(tokenHash).first<{
    expiresAt: number;
    accountId: string;
    loginName: string;
    displayName: string;
  }>();
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    await db.prepare("DELETE FROM farm_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return {
    accountId: row.accountId,
    userId: "farm:" + row.accountId,
    loginName: row.loginName,
    displayName: row.displayName,
  };
}

export async function deleteFarmSession(db: D1Database, cookieHeader: string | null) {
  const token = cookieValue(cookieHeader, FARM_SESSION_COOKIE);
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await db.prepare("DELETE FROM farm_sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export const farmSessionCookie = (token: string, secure: boolean) => {
  const parts = [
    FARM_SESSION_COOKIE + "=" + encodeURIComponent(token),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + FARM_SESSION_TTL_SECONDS,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
};

export const clearFarmSessionCookie = (secure: boolean) => {
  const parts = [
    FARM_SESSION_COOKIE + "=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
};
