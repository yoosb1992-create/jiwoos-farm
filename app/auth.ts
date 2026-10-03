import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getChatGPTUser } from "./chatgpt-auth";
import { findNativeSessionUser, readNativeSessionToken } from "@/server/auth/native";

export type AppUser = { userId: string; displayName: string; source: "chatgpt" | "native" };

export async function getAppUser(): Promise<AppUser | null> {
  const chatgpt = await getChatGPTUser();
  if (chatgpt) return { userId: chatgpt.userId, displayName: chatgpt.displayName, source: "chatgpt" };
  if (!env.DB) return null;
  const token = readNativeSessionToken((await headers()).get("cookie"));
  if (!token) return null;
  try {
    const native = await findNativeSessionUser(env.DB.withSession("first-primary"), token);
    return native ? { ...native, source: "native" } : null;
  } catch {
    return null;
  }
}
