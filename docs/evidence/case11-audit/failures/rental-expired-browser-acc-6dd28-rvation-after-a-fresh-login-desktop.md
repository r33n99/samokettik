# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rental.spec.ts >> expired browser access closes private realtime and restores the same reservation after a fresh login
- Location: tests\e2e\rental.spec.ts:506:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Выбрать демо-профиль', exact: true })
Expected: visible
Error: strict mode violation: getByRole('button', { name: 'Выбрать демо-профиль', exact: true }) resolved to 2 elements:
    1) <button type="button" class="account-button" aria-label="Выбрать демо-профиль">…</button> aka getByLabel('Выбрать демо-профиль')
    2) <button type="button" class="primary">Выбрать демо-профиль</button> aka getByRole('complementary', { name: 'Выбранный самокат' }).getByRole('button', { name: 'Выбрать демо-профиль' })

Call log:
  - Expect "toBeVisible" getByRole('button', { name: 'Выбрать демо-профиль', exact: true }) with timeout 70000ms
  - waiting for getByRole('button', { name: 'Выбрать демо-профиль', exact: true })

```

# Test source

```ts
  413 |     `outputs/frontend-stable-panel-${test.info().project.name}.json`,
  414 |     JSON.stringify(
  415 |       {
  416 |         recordedAt: new Date(Date.now() + 6 * 3600000)
  417 |           .toISOString()
  418 |           .replace("Z", "+06:00"),
  419 |         measurements,
  420 |       },
  421 |       null,
  422 |       2,
  423 |     ),
  424 |   );
  425 | });
  426 | 
  427 | test("ride pause resume finish history and demo payment use the backend invoice", async ({
  428 |   page,
  429 | }) => {
  430 |   await login(page);
  431 |   await start(page);
  432 |   const rental = (await current(page)).trip!;
  433 |   await expect(page.locator(".server-notice")).toHaveCount(0);
  434 |   await page.screenshot({
  435 |     path: `outputs/frontend-ride-${test.info().project.name}.png`,
  436 |     fullPage: true,
  437 |   });
  438 |   await expect(page.getByTestId("trip-cost")).toContainText("8");
  439 |   await page.getByRole("button", { name: "На паузу", exact: true }).click();
  440 |   await expect(
  441 |     page.getByRole("button", { name: "Продолжить", exact: true }),
  442 |   ).toBeEnabled();
  443 |   await expect(page.getByTestId("trip-cost")).toContainText("10");
  444 |   await page.screenshot({
  445 |     path: `outputs/frontend-pause-${test.info().project.name}.png`,
  446 |     fullPage: true,
  447 |   });
  448 |   await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  449 |   await expect(
  450 |     page.getByRole("button", { name: "На паузу", exact: true }),
  451 |   ).toBeEnabled();
  452 |   await finish(page);
  453 |   await expect(
  454 |     page.getByRole("complementary", { name: "Текущая поездка" }),
  455 |   ).toHaveCount(0);
  456 |   const result = await pool.query(
  457 |     "SELECT id,total_minor::text FROM invoices WHERE rental_id=$1",
  458 |     [rental.id],
  459 |   );
  460 |   expect(result.rows).toHaveLength(1);
  461 |   expect(result.rows[0].total_minor).toBe("1000");
  462 |   await page
  463 |     .getByRole("navigation")
  464 |     .getByRole("button", { name: "Поездки", exact: true })
  465 |     .click();
  466 |   await expect(page.locator(".history-entry").first()).toContainText("10 сом");
  467 |   await page
  468 |     .getByRole("navigation")
  469 |     .getByRole("button", { name: "Счета", exact: true })
  470 |     .click();
  471 |   await expect(page.locator(".history-page")).toHaveCount(1);
  472 |   const row = page
  473 |     .locator(".invoice-entry")
  474 |     .filter({ hasText: result.rows[0].id.slice(0, 8) });
  475 |   await row
  476 |     .getByRole("button", { name: "Оплатить в демо", exact: true })
  477 |     .click();
  478 |   const dialog = page.getByRole("dialog");
  479 |   await dialog
  480 |     .getByRole("button", { name: "Проверить отказ", exact: true })
  481 |     .click();
  482 |   await expect(dialog.getByRole("alert")).toBeVisible();
  483 |   await expect(dialog.getByText("Не оплачен", { exact: true })).toBeVisible();
  484 |   await expect(
  485 |     dialog.getByRole("button", { name: "Оплатить в демо", exact: true }),
  486 |   ).toBeEnabled();
  487 |   await dialog
  488 |     .getByRole("button", { name: "Оплатить в демо", exact: true })
  489 |     .click();
  490 |   await expect(dialog.getByText("Оплачен", { exact: true })).toBeVisible();
  491 |   expect(
  492 |     (
  493 |       await pool.query(
  494 |         "SELECT count(*)::int AS count FROM demo_payments WHERE invoice_id=$1",
  495 |         [result.rows[0].id],
  496 |       )
  497 |     ).rows[0].count,
  498 |   ).toBe(1);
  499 |   await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  500 |   await page.screenshot({
  501 |     path: `outputs/frontend-invoices-${test.info().project.name}.png`,
  502 |     fullPage: true,
  503 |   });
  504 | });
  505 | 
  506 | test("expired browser access closes private realtime and restores the same reservation after a fresh login", async ({ page }) => {
  507 |   test.setTimeout(80000);
  508 |   await login(page);
  509 |   await book(page);
  510 |   const identity = await session(page), before = await current(page);
  511 |   expect(Date.parse(identity.expiresAt) - Date.now()).toBeLessThanOrEqual(60000);
  512 |   // Real server-issued session expiration; no client clock or token is forged.
> 513 |   await expect(page.getByRole('button', { name: 'Выбрать демо-профиль', exact: true })).toBeVisible({ timeout: 70000 });
      |                                                                                         ^ Error: expect(locator).toBeVisible() failed
  514 |   await expect(page.locator('.rental-panel.own-rental')).toHaveCount(0);
  515 |   expect(await page.evaluate(() => sessionStorage.getItem('samokettik.demo.session'))).toBeNull();
  516 |   expect((await page.request.get('/api/v1/sync', { headers: { authorization: `Bearer ${identity.token}` } })).status()).toBe(401);
  517 |   await login(page);
  518 |   expect((await current(page)).reservation?.id).toBe(before.reservation?.id);
  519 | });
  520 | test("an offline browser restores its running ride and the worker continues movement and charge", async ({
  521 |   page,
  522 |   context,
  523 | }) => {
  524 |   await login(page);
  525 |   await start(page);
  526 |   const rental = (await current(page)).trip!;
  527 |   const before = (
  528 |     await pool.query("SELECT battery_bp FROM vehicles WHERE id=$1", [
  529 |       rental.vehicleId,
  530 |     ])
  531 |   ).rows[0].battery_bp;
  532 |   await context.setOffline(true);
  533 |   await expect(
  534 |     page.getByText("Нет сети. Поездка и тарификация продолжаются на сервере."),
  535 |   ).toBeVisible();
  536 |   await expect(
  537 |     page.getByRole("button", { name: "На паузу", exact: true }),
  538 |   ).toBeDisabled();
  539 |   await expect
  540 |     .poll(
  541 |       async () =>
  542 |         Number(
  543 |           (
  544 |             await pool.query("SELECT battery_bp FROM vehicles WHERE id=$1", [
  545 |               rental.vehicleId,
  546 |             ])
  547 |           ).rows[0].battery_bp,
  548 |         ),
  549 |       { timeout: 7000 },
  550 |     )
  551 |     .toBeLessThan(before);
  552 |   await context.setOffline(false);
  553 |   await expect(
  554 |     page.getByText("Синхронизировано", { exact: false }),
  555 |   ).toBeVisible();
  556 |   await expect(
  557 |     page.getByRole("button", { name: "На паузу", exact: true }),
  558 |   ).toBeEnabled();
  559 |   expect((await current(page)).trip?.id).toBe(rental.id);
  560 |   await finish(page);
  561 | });
  562 | test("a response lost after commit is replayed with the same key even after page reload", async ({
  563 |   page,
  564 | }) => {
  565 |   await login(page);
  566 |   await select(page);
  567 |   const keys: string[] = [];
  568 |   let firstId: string | undefined;
  569 |   await page.route("**/api/v1/reservations", async (route) => {
  570 |     keys.push(route.request().headers()["idempotency-key"]!);
  571 |     if (keys.length === 1) {
  572 |       const response = await route.fetch();
  573 |       firstId = (await response.json()).reservation.id;
  574 |       await route.abort("connectionreset");
  575 |     } else await route.continue();
  576 |   });
  577 |   await page
  578 |     .getByRole("button", { name: "Забронировать · 15 мин", exact: true })
  579 |     .click();
  580 |   await expect(
  581 |     page.getByRole("button", {
  582 |       name: "Повторить с тем же ключом",
  583 |       exact: true,
  584 |     }),
  585 |   ).toBeVisible();
  586 |   await page.reload();
  587 |   await expect(
  588 |     page.getByRole("button", {
  589 |       name: "Повторить с тем же ключом",
  590 |       exact: true,
  591 |     }),
  592 |   ).toBeEnabled();
  593 |   await page
  594 |     .getByRole("button", { name: "Повторить с тем же ключом", exact: true })
  595 |     .click();
  596 |   await expect(
  597 |     page.getByRole("button", {
  598 |       name: "Повторить с тем же ключом",
  599 |       exact: true,
  600 |     }),
  601 |   ).toHaveCount(0);
  602 |   expect(keys).toHaveLength(2);
  603 |   expect(keys[0]).toBe(keys[1]);
  604 |   expect((await current(page)).reservation?.id).toBe(firstId);
  605 |   expect(
  606 |     (
  607 |       await pool.query(
  608 |         "SELECT count(*)::int AS count FROM rentals WHERE id=$1",
  609 |         [firstId],
  610 |       )
  611 |     ).rows[0].count,
  612 |   ).toBe(1);
  613 | });
```