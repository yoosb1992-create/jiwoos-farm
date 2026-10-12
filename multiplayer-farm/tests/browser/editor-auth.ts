import { expect, type Page } from "@playwright/test";
const api="http://127.0.0.1:2575";
/** Real owner sessions, not an auth bypass, for disposable editor fixtures. */
export async function editorHeaders(page:Page):Promise<Record<string,string>> {
  const response=await page.request.post(`${api}/api/session`,{data:{create:true,nickname:"설계 농부"}});
  expect(response.ok()).toBe(true);
  const session=await response.json();return {Authorization:`Bearer ${session.token}`};
}
export async function authorizeEditor(page:Page):Promise<void> {
  const layout=await(await page.request.get(`${api}/api/blueprints/defaults`)).json();
  const response=await page.request.post(`${api}/api/blueprints`,{headers:await editorHeaders(page),data:layout});
  expect(response.ok()).toBe(true);const draft=await response.json();
  await page.addInitScript(cap=>localStorage.setItem("farm-editor-capability-v1",JSON.stringify(cap)),{id:draft.id,editToken:draft.editToken,revision:draft.revision});
}
