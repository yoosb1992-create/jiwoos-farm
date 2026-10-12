import { serverUrl } from "./config.js";
export const DEVELOPER_KEY = "farm-developer-ui-v1";
export function ownerAuthorization(): Record<string,string> {
  try {
    const session = JSON.parse(localStorage.getItem("farm-v26-session") ?? "null");
    return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
  } catch { return {}; }
}
export async function verifyDeveloperAccess(): Promise<boolean> {
  const url = serverUrl().replace(/^ws/,"http");
  try {
    if ((await fetch(`${url}/api/developer`, { headers: ownerAuthorization(), signal: AbortSignal.timeout(8000) })).ok) return true;
    const cap = JSON.parse(localStorage.getItem("farm-editor-capability-v1") ?? "null");
    return !!cap?.id && !!cap.editToken && (await fetch(`${url}/api/developer?blueprintId=${encodeURIComponent(cap.id)}`, {
      headers: { Authorization: `Bearer ${cap.editToken}` }, signal: AbortSignal.timeout(8000),
    })).ok;
  } catch { return false; }
}
