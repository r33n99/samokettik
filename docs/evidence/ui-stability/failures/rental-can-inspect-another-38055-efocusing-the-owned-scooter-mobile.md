# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rental.spec.ts >> can inspect another scooter while riding without refocusing the owned scooter
- Location: tests\e2e\rental.spec.ts:233:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Синхронизировано')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Синхронизировано') with timeout 5000ms
  - waiting for getByText('Синхронизировано')

```

# Test source

```ts
  1   | import { randomUUID } from "node:crypto";
  2   | import { setTimeout as delay } from "node:timers/promises";
  3   | import pg from "pg";
  4   | import {
  5   |   expect,
  6   |   test,
  7   |   type Page,
  8   |   type APIRequestContext,
  9   | } from "@playwright/test";
  10  | import { Value } from "@sinclair/typebox/value";
  11  | import {
  12  |   CurrentRentalSchema,
  13  |   DemoSessionSchema,
  14  |   VehicleListSchema,
  15  |   type DemoSession,
  16  | } from "@samokettik/contracts";
  17  | 
  18  | let pool: pg.Pool;
  19  | test.beforeAll(() => {
  20  |   const url = process.env["E2E_DATABASE_URL"];
  21  |   if (!url || !/^\/samokettik_test_[a-f0-9]{32}$/.test(new URL(url).pathname))
  22  |     throw new Error("Only isolated E2E database is allowed");
  23  |   pool = new pg.Pool({ connectionString: url });
  24  | });
  25  | test.afterAll(async () => {
  26  |   await pool?.end();
  27  | });
  28  | async function login(page: Page, label = "Айжан") {
  29  |   await page.goto("/");
  30  |   await expect(
  31  |     page.getByText("Синхронизировано", { exact: false }),
> 32  |   ).toBeVisible();
      |     ^ Error: expect(locator).toBeVisible() failed
  33  |   await page
  34  |     .getByRole("button", { name: "Выбрать демо-профиль", exact: true })
  35  |     .click();
  36  |   const sync = page.waitForResponse(
  37  |     (r) => new URL(r.url()).pathname === "/api/v1/sync" && r.status() === 200,
  38  |   );
  39  |   await page
  40  |     .getByRole("dialog")
  41  |     .locator(".profile-option")
  42  |     .filter({ hasText: label })
  43  |     .click();
  44  |   await sync;
  45  |   await expect(page.locator(".account-button")).toContainText(label);
  46  |   await expect(
  47  |     page.getByText("Синхронизировано", { exact: false }),
  48  |   ).toBeVisible();
  49  | }
  50  | async function select(page: Page, code = "SK-005") {
  51  |   await page
  52  |     .getByRole("button", { name: "Самокаты · 30", exact: true })
  53  |     .click();
  54  |   await page.getByRole("searchbox", { name: "Номер самоката" }).fill(code);
  55  |   await page
  56  |     .getByRole("dialog")
  57  |     .getByRole("button", { name: new RegExp(code) })
  58  |     .click();
  59  |   await expect(
  60  |     page.getByRole("heading", { name: code, exact: true }),
  61  |   ).toBeVisible();
  62  | }
  63  | async function session(page: Page): Promise<DemoSession> {
  64  |   const value: unknown = await page.evaluate(() =>
  65  |     JSON.parse(sessionStorage.getItem("samokettik.demo.session") ?? "null"),
  66  |   );
  67  |   if (!Value.Check(DemoSessionSchema, value))
  68  |     throw new Error("No valid session");
  69  |   return value;
  70  | }
  71  | async function current(page: Page) {
  72  |   const identity = await session(page),
  73  |     response = await page.request.get("/api/v1/rentals/current", {
  74  |       headers: { authorization: `Bearer ${identity.token}` },
  75  |     });
  76  |   expect(response.status()).toBe(200);
  77  |   const value: unknown = await response.json();
  78  |   if (!Value.Check(CurrentRentalSchema, value))
  79  |     throw new Error("Invalid current state");
  80  |   return value;
  81  | }
  82  | async function book(page: Page) {
  83  |   await select(page);
  84  |   await page
  85  |     .getByRole("button", { name: "Забронировать · 15 мин", exact: true })
  86  |     .click();
  87  |   await expect(
  88  |     page.getByRole("complementary", { name: "Ваша бронь" }),
  89  |   ).toBeVisible();
  90  |   await expect(
  91  |     page.getByRole("button", { name: "Начать поездку", exact: true }),
  92  |   ).toBeEnabled();
  93  | }
  94  | async function start(page: Page) {
  95  |   await book(page);
  96  |   await page
  97  |     .getByRole("button", { name: "Начать поездку", exact: true })
  98  |     .click();
  99  |   await expect(
  100 |     page.getByRole("complementary", { name: "Текущая поездка" }),
  101 |   ).toBeVisible();
  102 |   await expect(
  103 |     page.getByRole("button", { name: "На паузу", exact: true }),
  104 |   ).toBeEnabled();
  105 | }
  106 | async function finish(page: Page) {
  107 |   await page.getByRole("button", { name: "Завершить", exact: true }).click();
  108 |   await page
  109 |     .getByRole("dialog")
  110 |     .getByRole("button", { name: "Завершить поездку", exact: true })
  111 |     .click();
  112 | }
  113 | async function cleanup(request: APIRequestContext, baseURL: string) {
  114 |   // Only the dedicated E2E DB is touched. Restoring trusted GPS makes cleanup
  115 |   // possible after a deliberately rejected out-of-zone finish.
  116 |   await pool.query(
  117 |     "UPDATE vehicles SET longitude_e7=746020000,latitude_e7=428740000 WHERE id IN (SELECT vehicle_id FROM rentals WHERE state IN ('riding','paused'))",
  118 |   );
  119 |   await pool.query(
  120 |     "UPDATE trip_simulations SET speed_mm_per_minute=0 WHERE rental_id IN (SELECT id FROM rentals WHERE state IN ('riding','paused'))",
  121 |   );
  122 |   for (const profile of ["ru", "ky"]) {
  123 |     const response = await request.post("/api/v1/demo/session", {
  124 |         headers: { origin: baseURL },
  125 |         data: { profile },
  126 |       }),
  127 |       identity: unknown = await response.json();
  128 |     if (!Value.Check(DemoSessionSchema, identity))
  129 |       throw new Error("Cleanup login failed");
  130 |     const headers = {
  131 |         authorization: `Bearer ${identity.token}`,
  132 |         "idempotency-key": randomUUID(),
```