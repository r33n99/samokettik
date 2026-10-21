# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rental.spec.ts >> ride pause resume finish history and demo payment use the backend invoice
- Location: tests\e2e\rental.spec.ts:232:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog').getByRole('alert')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('dialog').getByRole('alert') with timeout 5000ms
  - waiting for getByRole('dialog').getByRole('alert')

```

```yaml
- banner:
  - link "СамоКеттик Бишкек":
    - /url: "#map"
  - navigation "Основная навигация":
    - button "Карта"
    - button "Поездки"
    - button "Счета"
  - button "Кыргызча": КЫР
  - 'button "Уведомления: 7"': "7"
  - 'button "Демо: Айжан"'
- status: Синхронизировано
- heading "Поездки" [level=1]
- paragraph: Последние 100 записей
- article:
  - paragraph: 21 окт. 2026 г., 01:14
  - heading "SK-005" [level=2]
  - paragraph: Завершена пользователем
  - term: Движение
  - definition: 0:00
  - term: Пауза
  - definition: 0:00
  - strong: 10 сом
  - button "Подробности"
- article:
  - paragraph: 21 окт. 2026 г., 01:13
  - heading "SK-005" [level=2]
  - paragraph: "Автостоп: разряд батареи"
  - term: Движение
  - definition: 0:00
  - term: Пауза
  - definition: 0:00
  - strong: 8 сом
  - button "Подробности"
- article:
  - paragraph: 21 окт. 2026 г., 01:13
  - heading "SK-005" [level=2]
  - paragraph: Завершена пользователем
  - term: Движение
  - definition: 0:00
  - term: Пауза
  - definition: 0:00
  - strong: 10 сом
  - button "Подробности"
- article:
  - paragraph: 21 окт. 2026 г., 01:13
  - heading "SK-005" [level=2]
  - paragraph: Завершена пользователем
  - term: Движение
  - definition: 0:04
  - term: Пауза
  - definition: 0:00
  - strong: 8 сом
  - button "Подробности"
- article:
  - paragraph: 21 окт. 2026 г., 01:13
  - heading "SK-005" [level=2]
  - paragraph: Завершена пользователем
  - term: Движение
  - definition: 0:00
  - term: Пауза
  - definition: 0:00
  - strong: 10 сом
  - button "Подробности"
- heading "Счета" [level=1]
- paragraph: Последние 100 записей
- article:
  - paragraph: 21 окт. 2026 г., 01:14
  - heading "e600df76" [level=2]
  - paragraph: Не оплачен
  - strong: 10 сом
  - button "Оплатить в демо"
- article:
  - paragraph: 21 окт. 2026 г., 01:13
  - heading "79e50985" [level=2]
  - paragraph: Не оплачен
  - strong: 8 сом
  - button "Оплатить в демо"
- article:
  - paragraph: 21 окт. 2026 г., 01:13
  - heading "18867a80" [level=2]
  - paragraph: Не оплачен
  - strong: 10 сом
  - button "Оплатить в демо"
- article:
  - paragraph: 21 окт. 2026 г., 01:13
  - heading "66987f85" [level=2]
  - paragraph: Не оплачен
  - strong: 8 сом
  - button "Оплатить в демо"
- article:
  - paragraph: 21 окт. 2026 г., 01:13
  - heading "79717eb0" [level=2]
  - paragraph: Не оплачен
  - strong: 10 сом
  - button "Оплатить в демо"
- dialog "Детали счёта":
  - heading "Детали счёта" [level=2]
  - button "Закрыть": ×
  - paragraph: e600df76-fd10-4783-853e-6ee80cb181d0
  - paragraph: "Выставлен: 21 окт. 2026 г., 01:14"
  - term: Движение · 1 мин
  - definition: 8 сом
  - term: Пауза · 1 мин
  - definition: 2 сом
  - term: Итого
  - definition: 10 сом
  - paragraph: Не оплачен
  - button "Оплатить в демо"
  - button "Проверить отказ"
  - paragraph: Демонстрационная оплата. Реальные деньги не списываются.
- alert:
  - strong: Демонстрационная оплата отклонена. Счёт остаётся неоплаченным
  - text: "requestId: req-90"
  - button "Закрыть": ×
- heading "Счета" [level=1]
- paragraph: Последние 100 записей
- article:
  - paragraph: 21 окт. 2026 г., 01:14
  - heading "e600df76" [level=2]
  - paragraph: Не оплачен
  - strong: 10 сом
  - button "Оплатить в демо"
- article:
  - paragraph: 21 окт. 2026 г., 01:13
  - heading "79e50985" [level=2]
  - paragraph: Не оплачен
  - strong: 8 сом
  - button "Оплатить в демо"
- article:
  - paragraph: 21 окт. 2026 г., 01:13
  - heading "18867a80" [level=2]
  - paragraph: Не оплачен
  - strong: 10 сом
  - button "Оплатить в демо"
- article:
  - paragraph: 21 окт. 2026 г., 01:13
  - heading "66987f85" [level=2]
  - paragraph: Не оплачен
  - strong: 8 сом
  - button "Оплатить в демо"
- article:
  - paragraph: 21 окт. 2026 г., 01:13
  - heading "79717eb0" [level=2]
  - paragraph: Не оплачен
  - strong: 10 сом
  - button "Оплатить в демо"
- status:
  - paragraph: Поездка завершена, счёт выставлен
  - button "Закрыть": ×
```

# Test source

```ts
  177 |     let count = 0;
  178 |     let release: () => void = () => {};
  179 |     const gate = new Promise<void>((resolve) => {
  180 |       release = resolve;
  181 |     });
  182 |     for (const tab of [page, other])
  183 |       await tab.route("**/api/v1/reservations", async (route) => {
  184 |         count++;
  185 |         if (count === 2) release();
  186 |         await gate;
  187 |         await route.continue();
  188 |       });
  189 |     const replies = [page, other].map((tab) =>
  190 |       tab.waitForResponse(
  191 |         (r) =>
  192 |           r.request().method() === "POST" &&
  193 |           new URL(r.url()).pathname === "/api/v1/reservations",
  194 |       ),
  195 |     );
  196 |     await Promise.all([
  197 |       page
  198 |         .getByRole("button", { name: "Забронировать · 15 мин", exact: true })
  199 |         .click(),
  200 |       other
  201 |         .getByRole("button", { name: "Забронировать · 15 мин", exact: true })
  202 |         .click(),
  203 |     ]);
  204 |     const responses = await Promise.all(replies);
  205 |     expect(responses.map((r) => r.status()).sort()).toEqual([201, 409]);
  206 |     const winner = responses[0]!.status() === 201 ? page : other,
  207 |       loser = winner === page ? other : page;
  208 |     await expect(winner.getByTestId("booking-timer")).toBeVisible();
  209 |     await expect(loser.getByRole("alert")).toContainText(
  210 |       "Этот самокат уже забронирован",
  211 |     );
  212 |     await expect(
  213 |       winner.getByRole("button", { name: "Отменить бронь", exact: true }),
  214 |     ).toBeEnabled();
  215 |     await winner
  216 |       .getByRole("button", { name: "Отменить бронь", exact: true })
  217 |       .click();
  218 |     await expect(
  219 |       loser.getByRole("button", {
  220 |         name: "Забронировать · 15 мин",
  221 |         exact: true,
  222 |       }),
  223 |     ).toBeEnabled();
  224 |     const active = await pool.query(
  225 |       "SELECT count(*)::int AS count FROM rentals WHERE state IN ('reserved','riding','paused')",
  226 |     );
  227 |     expect(active.rows[0].count).toBe(0);
  228 |   } finally {
  229 |     await otherContext.close();
  230 |   }
  231 | });
  232 | test("ride pause resume finish history and demo payment use the backend invoice", async ({
  233 |   page,
  234 | }) => {
  235 |   await login(page);
  236 |   await start(page);
  237 |   const rental = (await current(page)).trip!;
  238 |   await expect(page.getByTestId("trip-cost")).toContainText("8");
  239 |   await page.getByRole("button", { name: "На паузу", exact: true }).click();
  240 |   await expect(
  241 |     page.getByRole("button", { name: "Продолжить", exact: true }),
  242 |   ).toBeEnabled();
  243 |   await expect(page.getByTestId("trip-cost")).toContainText("10");
  244 |   await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  245 |   await expect(
  246 |     page.getByRole("button", { name: "На паузу", exact: true }),
  247 |   ).toBeEnabled();
  248 |   await finish(page);
  249 |   await expect(
  250 |     page.getByRole("complementary", { name: "Текущая поездка" }),
  251 |   ).toHaveCount(0);
  252 |   const result = await pool.query(
  253 |     "SELECT id,total_minor::text FROM invoices WHERE rental_id=$1",
  254 |     [rental.id],
  255 |   );
  256 |   expect(result.rows).toHaveLength(1);
  257 |   expect(result.rows[0].total_minor).toBe("1000");
  258 |   await page
  259 |     .getByRole("navigation")
  260 |     .getByRole("button", { name: "Поездки", exact: true })
  261 |     .click();
  262 |   await expect(page.locator(".history-entry").first()).toContainText("10 сом");
  263 |   await page
  264 |     .getByRole("navigation")
  265 |     .getByRole("button", { name: "Счета", exact: true })
  266 |     .click();
  267 |   const row = page
  268 |     .locator(".invoice-entry")
  269 |     .filter({ hasText: result.rows[0].id.slice(0, 8) });
  270 |   await row
  271 |     .getByRole("button", { name: "Оплатить в демо", exact: true })
  272 |     .click();
  273 |   const dialog = page.getByRole("dialog");
  274 |   await dialog
  275 |     .getByRole("button", { name: "Проверить отказ", exact: true })
  276 |     .click();
> 277 |   await expect(dialog.getByRole("alert")).toBeVisible();
      |                                           ^ Error: expect(locator).toBeVisible() failed
  278 |   await expect(dialog.getByText("Не оплачен", { exact: true })).toBeVisible();
  279 |   await expect(
  280 |     dialog.getByRole("button", { name: "Оплатить в демо", exact: true }),
  281 |   ).toBeEnabled();
  282 |   await dialog
  283 |     .getByRole("button", { name: "Оплатить в демо", exact: true })
  284 |     .click();
  285 |   await expect(dialog.getByText("Оплачен", { exact: true })).toBeVisible();
  286 |   expect(
  287 |     (
  288 |       await pool.query(
  289 |         "SELECT count(*)::int AS count FROM demo_payments WHERE invoice_id=$1",
  290 |         [result.rows[0].id],
  291 |       )
  292 |     ).rows[0].count,
  293 |   ).toBe(1);
  294 |   await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  295 |   await page.screenshot({
  296 |     path: `outputs/frontend-invoices-${test.info().project.name}.png`,
  297 |     fullPage: true,
  298 |   });
  299 | });
  300 | test("an offline browser restores its running ride and the worker continues movement and charge", async ({
  301 |   page,
  302 |   context,
  303 | }) => {
  304 |   await login(page);
  305 |   await start(page);
  306 |   const rental = (await current(page)).trip!;
  307 |   const before = (
  308 |     await pool.query("SELECT battery_bp FROM vehicles WHERE id=$1", [
  309 |       rental.vehicleId,
  310 |     ])
  311 |   ).rows[0].battery_bp;
  312 |   await context.setOffline(true);
  313 |   await expect(
  314 |     page.getByText("Нет сети. Поездка и тарификация продолжаются на сервере."),
  315 |   ).toBeVisible();
  316 |   await expect(
  317 |     page.getByRole("button", { name: "На паузу", exact: true }),
  318 |   ).toBeDisabled();
  319 |   await expect
  320 |     .poll(
  321 |       async () =>
  322 |         Number(
  323 |           (
  324 |             await pool.query("SELECT battery_bp FROM vehicles WHERE id=$1", [
  325 |               rental.vehicleId,
  326 |             ])
  327 |           ).rows[0].battery_bp,
  328 |         ),
  329 |       { timeout: 7000 },
  330 |     )
  331 |     .toBeLessThan(before);
  332 |   await context.setOffline(false);
  333 |   await expect(
  334 |     page.getByText("Синхронизировано", { exact: false }),
  335 |   ).toBeVisible();
  336 |   await expect(
  337 |     page.getByRole("button", { name: "На паузу", exact: true }),
  338 |   ).toBeEnabled();
  339 |   expect((await current(page)).trip?.id).toBe(rental.id);
  340 |   await finish(page);
  341 | });
  342 | test("a response lost after commit is replayed with the same key even after page reload", async ({
  343 |   page,
  344 | }) => {
  345 |   await login(page);
  346 |   await select(page);
  347 |   const keys: string[] = [];
  348 |   let firstId: string | undefined;
  349 |   await page.route("**/api/v1/reservations", async (route) => {
  350 |     keys.push(route.request().headers()["idempotency-key"]!);
  351 |     if (keys.length === 1) {
  352 |       const response = await route.fetch();
  353 |       firstId = (await response.json()).reservation.id;
  354 |       await route.abort("connectionreset");
  355 |     } else await route.continue();
  356 |   });
  357 |   await page
  358 |     .getByRole("button", { name: "Забронировать · 15 мин", exact: true })
  359 |     .click();
  360 |   await expect(
  361 |     page.getByRole("button", {
  362 |       name: "Повторить с тем же ключом",
  363 |       exact: true,
  364 |     }),
  365 |   ).toBeVisible();
  366 |   await page.reload();
  367 |   await expect(
  368 |     page.getByRole("button", {
  369 |       name: "Повторить с тем же ключом",
  370 |       exact: true,
  371 |     }),
  372 |   ).toBeEnabled();
  373 |   await page
  374 |     .getByRole("button", { name: "Повторить с тем же ключом", exact: true })
  375 |     .click();
  376 |   await expect(
  377 |     page.getByRole("button", {
```