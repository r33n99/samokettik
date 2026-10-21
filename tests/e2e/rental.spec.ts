import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { seedHistory } from "../support/history-fixture.js";
import { loadBusinessConfig } from "../../apps/server/src/config/business.js";
import { DEMO_USER_IDS } from "../../apps/server/src/config/demo-identities.js";
import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { Value } from "@sinclair/typebox/value";
import {
  CurrentRentalSchema,
  DemoSessionSchema,
  VehicleListSchema,
  type DemoSession,
} from "@samokettik/contracts";

let pool: pg.Pool;
test.beforeAll(() => {
  const url = process.env["E2E_DATABASE_URL"];
  if (!url || !/^\/samokettik_test_[a-f0-9]{32}$/.test(new URL(url).pathname))
    throw new Error("Only isolated E2E database is allowed");
  pool = new pg.Pool({ connectionString: url });
});
test.afterAll(async () => {
  await pool?.end();
});
async function login(page: Page, label = "Айжан") {
  await page.goto("/");
  await expect(
    page.getByText("Синхронизировано", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Выбрать демо-профиль", exact: true })
    .click();
  const sync = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/v1/sync" && r.status() === 200,
  );
  await page
    .getByRole("dialog")
    .locator(".profile-option")
    .filter({ hasText: label })
    .click();
  await sync;
  await expect(page.locator(".account-button")).toContainText(label);
  await expect(
    page.getByText("Синхронизировано", { exact: false }),
  ).toBeVisible();
}
async function select(page: Page, code = "SK-005") {
  await page
    .getByRole("button", { name: "Самокаты · 30", exact: true })
    .click();
  await page.getByRole("searchbox", { name: "Номер самоката" }).fill(code);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp(code) })
    .click();
  await expect(
    page.getByRole("heading", { name: code, exact: true }),
  ).toBeVisible();
}
async function session(page: Page): Promise<DemoSession> {
  const value: unknown = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("samokettik.demo.session") ?? "null"),
  );
  if (!Value.Check(DemoSessionSchema, value))
    throw new Error("No valid session");
  return value;
}
async function current(page: Page) {
  const identity = await session(page),
    response = await page.request.get("/api/v1/rentals/current", {
      headers: { authorization: `Bearer ${identity.token}` },
    });
  expect(response.status()).toBe(200);
  const value: unknown = await response.json();
  if (!Value.Check(CurrentRentalSchema, value))
    throw new Error("Invalid current state");
  return value;
}
async function book(page: Page) {
  await select(page);
  await page
    .getByRole("button", { name: "Забронировать · 15 мин", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Ваша бронь" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Начать поездку", exact: true }),
  ).toBeEnabled();
}
async function start(page: Page) {
  await book(page);
  await page
    .getByRole("button", { name: "Начать поездку", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Текущая поездка" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "На паузу", exact: true }),
  ).toBeEnabled();
}
async function finish(page: Page) {
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Завершить поездку", exact: true })
    .click();
}
async function cleanup(request: APIRequestContext, baseURL: string) {
  // Only the dedicated E2E DB is touched. Restoring trusted GPS makes cleanup
  // possible after a deliberately rejected out-of-zone finish.
  await pool.query(
    "UPDATE vehicles SET longitude_e7=746020000,latitude_e7=428740000 WHERE id IN (SELECT vehicle_id FROM rentals WHERE state IN ('riding','paused'))",
  );
  await pool.query(
    "UPDATE trip_simulations SET speed_mm_per_minute=0 WHERE rental_id IN (SELECT id FROM rentals WHERE state IN ('riding','paused'))",
  );
  for (const profile of ["ru", "ky"]) {
    const response = await request.post("/api/v1/demo/session", {
        headers: { origin: baseURL },
        data: { profile },
      }),
      identity: unknown = await response.json();
    if (!Value.Check(DemoSessionSchema, identity))
      throw new Error("Cleanup login failed");
    const headers = {
        authorization: `Bearer ${identity.token}`,
        "idempotency-key": randomUUID(),
      },
      stateResponse = await request.get("/api/v1/rentals/current", { headers }),
      state: unknown = await stateResponse.json();
    if (!Value.Check(CurrentRentalSchema, state))
      throw new Error("Cleanup state failed");
    if (state.reservation)
      expect(
        (
          await request.post(
            `/api/v1/reservations/${state.reservation.id}/cancel`,
            { headers, data: {} },
          )
        ).status(),
      ).toBe(200);
    if (state.trip)
      expect(
        (
          await request.post(`/api/v1/trips/${state.trip.id}/finish`, {
            headers,
            data: {},
          })
        ).status(),
      ).toBe(200);
  }
}
test.afterEach(async ({ request, baseURL }) => {
  await cleanup(request, baseURL!);
});

test("two browser users compete for one scooter; one reservation wins and cancel releases it", async ({
  page,
  browser,
  baseURL,
}) => {
  const otherContext = await browser.newContext({
      viewport: page.viewportSize()!,
      baseURL: baseURL!,
    }),
    other = await otherContext.newPage();
  try {
    await login(page);
    await login(other, "Бек");
    await select(page);
    await select(other);
    let count = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    for (const tab of [page, other])
      await tab.route("**/api/v1/reservations", async (route) => {
        count++;
        if (count === 2) release();
        await gate;
        await route.continue();
      });
    const replies = [page, other].map((tab) =>
      tab.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          new URL(r.url()).pathname === "/api/v1/reservations",
      ),
    );
    await Promise.all([
      page
        .getByRole("button", { name: "Забронировать · 15 мин", exact: true })
        .click(),
      other
        .getByRole("button", { name: "Забронировать · 15 мин", exact: true })
        .click(),
    ]);
    const responses = await Promise.all(replies);
    expect(responses.map((r) => r.status()).sort()).toEqual([201, 409]);
    const winner = responses[0]!.status() === 201 ? page : other,
      loser = winner === page ? other : page;
    await expect(winner.getByTestId("booking-timer")).toBeVisible();
    await expect(loser.getByRole("alert")).toContainText(
      "Этот самокат уже забронирован",
    );
    await expect(
      winner.getByRole("button", { name: "Отменить бронь", exact: true }),
    ).toBeEnabled();
    await winner
      .getByRole("button", { name: "Отменить бронь", exact: true })
      .click();
    await expect(
      loser.getByRole("button", {
        name: "Забронировать · 15 мин",
        exact: true,
      }),
    ).toBeEnabled();
    const active = await pool.query(
      "SELECT count(*)::int AS count FROM rentals WHERE state IN ('reserved','riding','paused')",
    );
    expect(active.rows[0].count).toBe(0);
  } finally {
    await otherContext.close();
  }
});
for (const mode of ["reserved", "riding"] as const) {
  test(`can inspect another scooter while ${mode} without refocusing the owned scooter`, async ({
    page,
  }) => {
    await login(page);
    if (mode === "reserved") await book(page);
    else await start(page);
    const original = await current(page);
    await select(page, "SK-006");
    const panel = page.getByRole("complementary", {
      name: "Выбранный самокат",
    });
    await expect(
      panel.getByRole("heading", { name: "SK-006", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".list-toggle")).toBeInViewport({ ratio: 1 });
    await expect(
      panel.getByRole("button", {
        name: "Забронировать · 15 мин",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      panel.getByText("У вас уже есть бронь или поездка.", { exact: true }),
    ).toBeVisible();
    const selected = page.locator(
      '.transport-pin.selected[aria-label^="SK-006"]',
    );
    await expect(selected).toBeInViewport();
    await expect(
      page.locator('.transport-pin.own[aria-label^="SK-005"]'),
    ).not.toHaveClass(/selected/);
    // Wait through a real WS update and a REST/reconnect cycle: neither may
    // replace explicit selection or move the map back to the owned vehicle.
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    });
    await expect(
      page.getByText("Синхронизировано", { exact: false }),
    ).toBeVisible();
    await expect(selected).toBeInViewport();
    await expect(
      panel.getByRole("heading", { name: "SK-006", exact: true }),
    ).toBeVisible();
    const restored = await current(page);
    expect(restored.reservation?.id ?? restored.trip?.id).toBe(
      original.reservation?.id ?? original.trip?.id,
    );
    await page.screenshot({
      path: `outputs/frontend-inspect-${mode}-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Показать свой самокат", exact: true })
      .click();
    const ownedPanel = page.getByRole("complementary", {
      name: mode === "reserved" ? "Ваша бронь" : "Текущая поездка",
    });
    await expect(
      ownedPanel.getByRole("heading", { name: "SK-005", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.transport-pin.own.selected[aria-label^="SK-005"]'),
    ).toBeInViewport();
  });
}

test("pause and resume keep panel geometry stable during slow real requests and state restoration", async ({
  page,
}) => {
  await login(page);
  await start(page);
  await page.evaluate(() => document.fonts.ready);
  const panel = page.locator(".rental-panel.own-rental");
  let delaySync = false,
    syncRequests = 0,
    mutations = 0;
  await page.route("**/api/v1/sync", async (route) => {
    const response = await route.fetch();
    if (delaySync) {
      syncRequests++;
      await delay(400);
    }
    await route.fulfill({ response });
  });
  await page.route(
    /\/api\/v1\/trips\/[^/]+\/(pause|resume)$/,
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      mutations++;
      delaySync = true;
      await delay(400);
      await route.fulfill({ response });
    },
  );
  const geometry = () =>
    panel.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        top: rect.top,
        left: rect.left,
        height: rect.height,
        width: rect.width,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        actionsTop: el.querySelector(".rental-actions")!.getBoundingClientRect()
          .top,
      };
    });
  const measurements = [];
  for (const locale of ["ru", "ky"] as const) {
    if (locale === "ky")
      await page.getByRole("button", { name: "Кыргызча", exact: true }).click();
    const baseline = await geometry();
    const actions: readonly (readonly [string, string])[] =
      locale === "ru"
        ? [
            ["На паузу", "Продолжить"],
            ["Продолжить", "На паузу"],
          ]
        : [
            ["Тыныгуу", "Улантуу"],
            ["Улантуу", "Тыныгуу"],
          ];
    for (const [action, next] of actions) {
      const sampling = panel.evaluate(async (el) => {
        const frames = [];
        for (let i = 0; i < 90; i++) {
          const rect = el.getBoundingClientRect();
          frames.push({
            top: rect.top,
            left: rect.left,
            height: rect.height,
            width: rect.width,
            clientWidth: el.clientWidth,
            clientHeight: el.clientHeight,
            scrollHeight: el.scrollHeight,
            scrollTop: el.scrollTop,
            actionsTop: el
              .querySelector(".rental-actions")!
              .getBoundingClientRect().top,
          });
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
        }
        return frames;
      });
      await panel.getByRole("button", { name: action, exact: true }).click();
      await expect(panel.locator('.primary[aria-busy="true"]')).toBeVisible();
      await expect(
        panel.getByRole("button", { name: next, exact: true }),
      ).toBeEnabled();
      const frames = await sampling;
      for (const frame of frames) expect(frame).toEqual(baseline);
      measurements.push({
        locale,
        action,
        frames: frames.length,
        geometry: baseline,
      });
    }
  }
  expect(mutations).toBe(4);
  expect(syncRequests).toBeGreaterThanOrEqual(4);
  await test.info().attach("stable-panel-geometry", {
    body: JSON.stringify(measurements, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({
    path: `outputs/frontend-stable-panel-${test.info().project.name}.png`,
    fullPage: true,
  });
  await writeFile(
    `outputs/frontend-stable-panel-${test.info().project.name}.json`,
    JSON.stringify(
      {
        recordedAt: new Date(Date.now() + 6 * 3600000)
          .toISOString()
          .replace("Z", "+06:00"),
        measurements,
      },
      null,
      2,
    ),
  );
});

test("ride pause resume finish history and demo payment use the backend invoice", async ({
  page,
}) => {
  await login(page);
  await start(page);
  const rental = (await current(page)).trip!;
  await expect(page.locator(".server-notice")).toHaveCount(0);
  await page.screenshot({
    path: `outputs/frontend-ride-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(page.getByTestId("trip-cost")).toContainText("8");
  await page.getByRole("button", { name: "На паузу", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Продолжить", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("trip-cost")).toContainText("10");
  await page.screenshot({
    path: `outputs/frontend-pause-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "На паузу", exact: true }),
  ).toBeEnabled();
  await finish(page);
  await expect(
    page.getByRole("complementary", { name: "Текущая поездка" }),
  ).toHaveCount(0);
  const result = await pool.query(
    "SELECT id,total_minor::text FROM invoices WHERE rental_id=$1",
    [rental.id],
  );
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].total_minor).toBe("1000");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Поездки", exact: true })
    .click();
  await expect(page.locator(".history-entry").first()).toContainText("10 сом");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Счета", exact: true })
    .click();
  await expect(page.locator(".history-page")).toHaveCount(1);
  const row = page
    .locator(".invoice-entry")
    .filter({ hasText: result.rows[0].id.slice(0, 8) });
  await row
    .getByRole("button", { name: "Оплатить в демо", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Проверить отказ", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByText("Не оплачен", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Оплатить в демо", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Оплатить в демо", exact: true })
    .click();
  await expect(dialog.getByText("Оплачен", { exact: true })).toBeVisible();
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM demo_payments WHERE invoice_id=$1",
        [result.rows[0].id],
      )
    ).rows[0].count,
  ).toBe(1);
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.screenshot({
    path: `outputs/frontend-invoices-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("expired browser access closes private realtime and restores the same reservation after a fresh login", async ({
  page,
}) => {
  test.setTimeout(80000);
  await login(page);
  await book(page);
  const identity = await session(page),
    before = await current(page);
  expect(Date.parse(identity.expiresAt) - Date.now()).toBeLessThanOrEqual(
    60000,
  );
  // Real server-issued session expiration; no client clock or token is forged.
  await expect(
    page.locator('.account-button[aria-label="Выбрать демо-профиль"]'),
  ).toBeVisible({ timeout: 70000 });
  await expect(page.locator(".rental-panel.own-rental")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("samokettik.demo.session"),
    ),
  ).toBeNull();
  expect(
    (
      await page.request.get("/api/v1/sync", {
        headers: { authorization: `Bearer ${identity.token}` },
      })
    ).status(),
  ).toBe(401);
  await login(page);
  expect((await current(page)).reservation?.id).toBe(before.reservation?.id);
});
test("an offline browser restores its running ride and the worker continues movement and charge", async ({
  page,
  context,
}) => {
  await login(page);
  await start(page);
  const rental = (await current(page)).trip!;
  const before = (
    await pool.query("SELECT battery_bp FROM vehicles WHERE id=$1", [
      rental.vehicleId,
    ])
  ).rows[0].battery_bp;
  await context.setOffline(true);
  await expect(
    page.getByText("Нет сети. Поездка и тарификация продолжаются на сервере."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "На паузу", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(
      async () =>
        Number(
          (
            await pool.query("SELECT battery_bp FROM vehicles WHERE id=$1", [
              rental.vehicleId,
            ])
          ).rows[0].battery_bp,
        ),
      { timeout: 7000 },
    )
    .toBeLessThan(before);
  await context.setOffline(false);
  await expect(
    page.getByText("Синхронизировано", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "На паузу", exact: true }),
  ).toBeEnabled();
  expect((await current(page)).trip?.id).toBe(rental.id);
  await finish(page);
});
test("a response lost after commit is replayed with the same key even after page reload", async ({
  page,
}) => {
  await login(page);
  await select(page);
  const keys: string[] = [];
  let firstId: string | undefined;
  await page.route("**/api/v1/reservations", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]!);
    if (keys.length === 1) {
      const response = await route.fetch();
      firstId = (await response.json()).reservation.id;
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Забронировать · 15 мин", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Повторить с тем же ключом",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Повторить с тем же ключом",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Повторить с тем же ключом", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Повторить с тем же ключом",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect((await current(page)).reservation?.id).toBe(firstId);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM rentals WHERE id=$1",
        [firstId],
      )
    ).rows[0].count,
  ).toBe(1);
});
test("server rejects finish outside the polygon and allows it after trusted coordinates return", async ({
  page,
}) => {
  await login(page);
  await start(page);
  await page.getByRole("button", { name: "На паузу", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Продолжить", exact: true }),
  ).toBeEnabled();
  const rental = (await current(page)).trip!;
  await pool.query(
    "UPDATE trip_simulations SET speed_mm_per_minute=0 WHERE rental_id=$1",
    [rental.id],
  );
  await pool.query(
    "UPDATE vehicles SET longitude_e7=0,latitude_e7=0 WHERE id=$1",
    [rental.vehicleId],
  );
  await finish(page);
  await expect(page.getByRole("alert")).toContainText(
    "Завершить поездку вне зоны нельзя",
  );
  expect((await current(page)).trip?.id).toBe(rental.id);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM invoices WHERE rental_id=$1",
        [rental.id],
      )
    ).rows[0].count,
  ).toBe(0);
  await pool.query(
    "UPDATE vehicles SET longitude_e7=746020000,latitude_e7=428740000 WHERE id=$1",
    [rental.vehicleId],
  );
  await expect(
    page.getByRole("button", { name: "Завершить", exact: true }),
  ).toBeEnabled();
  await finish(page);
  await expect(
    page.getByRole("complementary", { name: "Текущая поездка" }),
  ).toHaveCount(0);
});
test("persistent warning and automatic expiration release the reservation in the browser", async ({
  page,
}) => {
  await login(page);
  await book(page);
  const rental = (await current(page)).reservation!;
  await pool.query(
    "UPDATE rentals SET reserved_at=date_trunc('milliseconds',clock_timestamp())-interval '13 minutes',warn_at=date_trunc('milliseconds',clock_timestamp())-interval '1 minute',expires_at=date_trunc('milliseconds',clock_timestamp())+interval '3 seconds' WHERE id=$1",
    [rental.id],
  );
  await expect(
    page.getByText("До истечения брони осталось меньше трёх минут", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Ваша бронь" }),
  ).toHaveCount(0, { timeout: 6000 });
  await expect(
    page.getByRole("button", { name: "Забронировать · 15 мин", exact: true }),
  ).toBeEnabled();
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM notifications WHERE rental_id=$1 AND code IN ('RESERVATION_EXPIRING','RESERVATION_EXPIRED')",
        [rental.id],
      )
    ).rows[0].count,
  ).toBe(2);
});
test("depletion updates the browser with one invoice, notification and local mail", async ({
  page,
}) => {
  await login(page);
  await start(page);
  const rental = (await current(page)).trip!;
  await pool.query(
    "UPDATE trip_simulations SET ride_drain_bp_per_minute=60000,tick_ms=100 WHERE rental_id=$1",
    [rental.id],
  );
  await pool.query(
    "UPDATE vehicles SET battery_bp=50,battery_remainder=0 WHERE id=$1",
    [rental.vehicleId],
  );
  await expect(
    page.getByRole("complementary", { name: "Текущая поездка" }),
  ).toHaveCount(0, { timeout: 6000 });
  await expect(page.locator(".server-notice")).toContainText(
    "Автостоп: разряд батареи",
  );
  await page.getByRole("button", { name: /Уведомления:/ }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Автостоп: разряд батареи",
  );
  await expect
    .poll(async () =>
      Number(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM local_mailbox m JOIN invoices i ON i.id=m.invoice_id WHERE i.rental_id=$1",
            [rental.id],
          )
        ).rows[0].count,
      ),
    )
    .toBe(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM notifications WHERE rental_id=$1 AND code='TRIP_FINISHED'",
        [rental.id],
      )
    ).rows[0].count,
  ).toBe(1);
  const fleet = await page.request.get("/api/v1/vehicles"),
    value: unknown = await fleet.json();
  if (!Value.Check(VehicleListSchema, value)) throw new Error("Invalid fleet");
  expect(value.items.find((v) => v.id === rental.vehicleId)).toMatchObject({
    batteryBp: 0,
    status: "unavailable",
  });
  // Recharge is a test fixture only; no recharge endpoint exists in the app.
  await pool.query(
    "UPDATE vehicles SET battery_bp=9300,battery_remainder=0 WHERE id=$1",
    [rental.vehicleId],
  );
  await delay(120);
});


test('marker clicks preserve the viewport and the explicit locate button restores the owned scooter', async ({ page }) => {
  await login(page); await book(page);
  await page.getByRole('button', { name: 'Самокаты', exact: true }).click();
  const pin = page.locator('.transport-pin.available').filter({ hasNot: page.locator('.own') });
  await expect(pin.first()).toBeAttached();
  const choose = await page.locator('.transport-pin.available').evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect(), x = r.x+r.width/2, y = r.y+r.height/2;
    return { label: element.getAttribute('aria-label'), x, y, visible: x>40 && x<innerWidth-40 && y>160 && y<innerHeight-100 && element.contains(document.elementFromPoint(x,y)) };
  }).find(item => item.visible));
  expect(choose?.label).toBeTruthy();
  const marker = page.getByRole('button', { name: choose!.label!, exact: true });
  const before = await marker.boundingBox();
  await marker.click();
  await expect(marker).toHaveClass(/selected/);
  const after = await marker.boundingBox();
  expect(Math.abs(after!.x + after!.width/2 - before!.x - before!.width/2)).toBeLessThan(1);
  expect(Math.abs(after!.y + after!.height/2 - before!.y - before!.height/2)).toBeLessThan(1);
  await expect(page.getByRole('complementary', { name: 'Выбранный самокат' })).toBeVisible();
  await page.getByRole('button', { name: 'Показать свой самокат', exact: true }).click();
  await expect(page.locator('.transport-pin.own.selected')).toBeInViewport();
  const attribution = page.locator('.leaflet-control-attribution');
  await expect(attribution).not.toContainText('Leaflet');
  await expect(attribution.getByRole('link', { name: 'OpenStreetMap' })).toBeInViewport({ ratio: 1 });
  const credit = await attribution.boundingBox(), panel = await page.locator('.rental-panel').boundingBox();
  expect(credit!.y).toBeGreaterThanOrEqual(panel!.y + panel!.height);
  await page.screenshot({ path: 'outputs/history-map-' + test.info().project.name + '.png', fullPage: true });
});

test('histories paginate beyond 100 rows, navigate back, recover an error and pay an older invoice', async ({ page }) => {
  test.setTimeout(60000);
  await seedHistory(pool, DEMO_USER_IDS.ru, '10000000-0000-4000-8000-000000000005', 105, loadBusinessConfig().serviceZone);
  await login(page);
  for (const view of ['trips', 'invoices'] as const) {
    await page.getByRole('navigation').first().getByRole('button', { name: view === 'trips' ? 'Поездки' : 'Счета', exact: true }).click();
    const nav = page.getByRole('navigation', { name: 'Страницы истории' });
    await expect(nav.getByRole('status')).toHaveText('Страница 1');
    const attr = view === 'trips' ? 'data-trip-id' : 'data-invoice-id';
    const read = () => page.locator('.history-entry').evaluateAll((rows, name) => rows.map(row => row.getAttribute(name)), attr);
    const first = await read(); expect(first).toHaveLength(20);
    await nav.getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(nav.getByRole('status')).toHaveText('Страница 2');
    const second = await read(); expect(second.some(id => first.includes(id))).toBe(false);
    await nav.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect(nav.getByRole('status')).toHaveText('Страница 1'); expect(await read()).toEqual(first);
    if (view === 'invoices') {
      await page.route('**/api/v1/invoices?*', route => route.fulfill({ status: 503, json: { code: 'TEMPORARY', message: 'test fixture', requestId: 'fixture' } }), { times: 1 });
      await nav.getByRole('button', { name: 'Далее', exact: true }).click();
      await expect(page.locator('.history-page').getByRole('alert')).toBeVisible();
      await page.locator('.history-page').getByRole('button', { name: 'Повторить', exact: true }).click();
      await expect(nav.getByRole('status')).toHaveText('Страница 2'); expect(await read()).toEqual(second);
      await nav.getByRole('button', { name: 'Назад', exact: true }).click();
      await expect(nav.getByRole('status')).toHaveText('Страница 1');
    }
    const seen = [...first]; let number = 1;
    while (await nav.getByRole('button', { name: 'Далее', exact: true }).isEnabled()) {
      await nav.getByRole('button', { name: 'Далее', exact: true }).click(); number++;
      await expect(nav.getByRole('status')).toHaveText('Страница ' + number);
      seen.push(...await read());
    }
    expect(seen.length).toBeGreaterThan(100); expect(new Set(seen).size).toBe(seen.length);
    if (view === 'invoices') {
      const unpaid = page.locator('.history-entry').filter({ has: page.getByRole('button', { name: 'Оплатить в демо', exact: true }) }).last();
      const invoiceId = await unpaid.getAttribute('data-invoice-id');
      const last = page.locator('[data-invoice-id="' + invoiceId + '"]');
      await last.getByRole('button', { name: 'Оплатить в демо', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Оплатить в демо', exact: true }).click();
      await expect(page.getByRole('dialog').getByText('Оплачен', { exact: true })).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
      await expect(last).toContainText('Оплачен');
      await page.screenshot({ path: 'outputs/history-pagination-' + test.info().project.name + '.png', fullPage: true });
    }
  }
});
