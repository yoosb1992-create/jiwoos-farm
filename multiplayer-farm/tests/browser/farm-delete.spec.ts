import { test, expect } from "@playwright/test";

test("farm deletion uses one confirmation dialog, no family-code prompt, and invalidates the owner session", async ({page}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.locator("#nickname").fill("간편 삭제 확인");
  await page.locator("#create-farm").click();
  await expect(page.locator("#connection")).toHaveAttribute("data-status", "connected");
  const farm = await page.evaluate(() => JSON.parse(localStorage.getItem("farm-v26-session")!));
  await page.goto("/?newFarm=1");
  await expect(page.locator("#login")).toBeVisible();
  const saved = page.locator("#saved-farms").getByText(farm.farmId);
  await expect(saved).toBeVisible();

  const dialogs: string[] = [];
  page.on("dialog", async dialog => {
    dialogs.push(dialog.type());
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("정말 삭제하시겠습니까");
    await dialog.accept();
  });
  await page.locator("#saved-farms").getByRole("button", {name:"삭제"}).first().click();
  await expect.poll(() => page.evaluate(id =>
    !(JSON.parse(localStorage.getItem("farm-v26-sessions") ?? "[]") as {farmId:string}[]).some(v=>v.farmId===id),
    farm.farmId
  ), {timeout:50000}).toBe(true);
  expect(dialogs).toEqual(["confirm"]);
  const revoked = await page.evaluate(async ({http,token}) => {
    const r = await fetch(http+"/api/session",{headers:{Authorization:`Bearer ${token}`}});
    return r.status;
  }, {http: new URL(page.url()).origin.replace("5175","2575"), token:farm.token});
  expect(revoked).toBe(401);
});
