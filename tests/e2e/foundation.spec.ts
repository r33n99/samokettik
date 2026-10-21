import { expect, test } from "@playwright/test";
test("map reads real API fleet and geozone, supports keyboard list and RU/KY", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("Синхронизировано", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".transport-pin")).toHaveCount(30);
  await expect(page.locator("path.leaflet-interactive")).toHaveCount(1);
  await page.getByRole("button", { name: "Вся геозона", exact: true }).click();
  await page
    .getByRole("button", { name: "Самокаты · 30", exact: true })
    .click();
  await page.getByRole("searchbox", { name: "Номер самоката" }).fill("SK-005");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /SK-005/ })
    .press("Enter");
  await expect(
    page.getByRole("heading", { name: "SK-005", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Кыргызча", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ky");
  await expect(page.getByText("Электр самокат", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Жакындатуу", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Русский", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          [
            ...document.querySelectorAll<HTMLImageElement>(".leaflet-tile"),
          ].filter((image) => image.complete && image.naturalWidth > 0).length,
      ),
    )
    .toBeGreaterThan(0);
  await page.waitForFunction(
    () => !document.querySelector(".leaflet-zoom-anim"),
  );
  await page.screenshot({
    path: `outputs/frontend-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("tile failure leaves authoritative markers, geozone and accessible selection usable", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort("failed"),
  );
  await page.goto("/");
  await expect(page.locator(".transport-pin")).toHaveCount(30);
  await expect(
    page.getByText(
      "Подложка карты недоступна. Самокаты и геозона остаются видимыми.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Самокаты · 30", exact: true })
    .click();
  await page.getByRole("searchbox", { name: "Номер самоката" }).fill("SK-005");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /SK-005/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "SK-005", exact: true }),
  ).toBeVisible();
});
test("startup API error is explained and retry loads actual data", async ({
  page,
}) => {
  // Only the unavailable startup response is controlled. Success is real API+PG.
  let failed = true;
  await page.route("**/api/v1/client-config", async (route) => {
    if (failed)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
    else await route.continue();
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Не удалось загрузить данные" }),
  ).toBeVisible();
  failed = false;
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Повторить", exact: true })
    .click();
  await expect(page.locator(".transport-pin")).toHaveCount(30);
});
