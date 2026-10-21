import { expect, test, type WebSocketRoute } from "@playwright/test";

test("WebSocket reconnection restores authoritative fleet through API", async ({
  page,
}) => {
  let restores = 0;
  const sockets: WebSocketRoute[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/vehicles") restores++;
  });
  await page.routeWebSocket("**/api/v1/realtime", (route) => {
    route.connectToServer();
    sockets.push(route);
  });
  await page.goto("/");
  await expect(
    page.getByText("Синхронизировано", { exact: false }),
  ).toBeVisible();
  await expect.poll(() => restores).toBeGreaterThan(0);
  const before = restores;
  const active = sockets.at(-1);
  if (!active) throw new Error("No websocket connection");
  await active.close({ code: 1012, reason: "Test network interruption" });
  await expect.poll(() => restores).toBeGreaterThan(before);
  await expect(
    page.getByText("Синхронизировано", { exact: false }),
  ).toBeVisible();
  await expect.poll(() => sockets.length).toBeGreaterThan(1);
  await expect(page.locator(".transport-pin")).toHaveCount(30);
});
