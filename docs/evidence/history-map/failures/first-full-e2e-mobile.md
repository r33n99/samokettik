# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rental.spec.ts >> histories paginate beyond 100 rows, navigate back, recover an error and pay an older invoice
- Location: tests\e2e\rental.spec.ts:793:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('.history-entry').last().getByRole('button', { name: 'Оплатить в демо', exact: true })

```

# Test source

```ts
  727 |     "Автостоп: разряд батареи",
  728 |   );
  729 |   await expect
  730 |     .poll(async () =>
  731 |       Number(
  732 |         (
  733 |           await pool.query(
  734 |             "SELECT count(*)::int AS count FROM local_mailbox m JOIN invoices i ON i.id=m.invoice_id WHERE i.rental_id=$1",
  735 |             [rental.id],
  736 |           )
  737 |         ).rows[0].count,
  738 |       ),
  739 |     )
  740 |     .toBe(1);
  741 |   expect(
  742 |     (
  743 |       await pool.query(
  744 |         "SELECT count(*)::int AS count FROM notifications WHERE rental_id=$1 AND code='TRIP_FINISHED'",
  745 |         [rental.id],
  746 |       )
  747 |     ).rows[0].count,
  748 |   ).toBe(1);
  749 |   const fleet = await page.request.get("/api/v1/vehicles"),
  750 |     value: unknown = await fleet.json();
  751 |   if (!Value.Check(VehicleListSchema, value)) throw new Error("Invalid fleet");
  752 |   expect(value.items.find((v) => v.id === rental.vehicleId)).toMatchObject({
  753 |     batteryBp: 0,
  754 |     status: "unavailable",
  755 |   });
  756 |   // Recharge is a test fixture only; no recharge endpoint exists in the app.
  757 |   await pool.query(
  758 |     "UPDATE vehicles SET battery_bp=9300,battery_remainder=0 WHERE id=$1",
  759 |     [rental.vehicleId],
  760 |   );
  761 |   await delay(120);
  762 | });
  763 | 
  764 | 
  765 | test('marker clicks preserve the viewport and the explicit locate button restores the owned scooter', async ({ page }) => {
  766 |   await login(page); await book(page);
  767 |   await page.getByRole('button', { name: 'Самокаты', exact: true }).click();
  768 |   const pin = page.locator('.transport-pin.available').filter({ hasNot: page.locator('.own') });
  769 |   await expect(pin.first()).toBeAttached();
  770 |   const choose = await page.locator('.transport-pin.available').evaluateAll(elements => elements.map(element => {
  771 |     const r = element.getBoundingClientRect(), x = r.x+r.width/2, y = r.y+r.height/2;
  772 |     return { label: element.getAttribute('aria-label'), x, y, visible: x>40 && x<innerWidth-40 && y>160 && y<innerHeight-100 && element.contains(document.elementFromPoint(x,y)) };
  773 |   }).find(item => item.visible));
  774 |   expect(choose?.label).toBeTruthy();
  775 |   const marker = page.getByRole('button', { name: choose!.label!, exact: true });
  776 |   const before = await marker.boundingBox();
  777 |   await marker.click();
  778 |   await expect(marker).toHaveClass(/selected/);
  779 |   const after = await marker.boundingBox();
  780 |   expect(Math.abs(after!.x + after!.width/2 - before!.x - before!.width/2)).toBeLessThan(1);
  781 |   expect(Math.abs(after!.y + after!.height/2 - before!.y - before!.height/2)).toBeLessThan(1);
  782 |   await expect(page.getByRole('complementary', { name: 'Выбранный самокат' })).toBeVisible();
  783 |   await page.getByRole('button', { name: 'Показать свой самокат', exact: true }).click();
  784 |   await expect(page.locator('.transport-pin.own.selected')).toBeInViewport();
  785 |   const attribution = page.locator('.leaflet-control-attribution');
  786 |   await expect(attribution).not.toContainText('Leaflet');
  787 |   await expect(attribution.getByRole('link', { name: 'OpenStreetMap' })).toBeInViewport({ ratio: 1 });
  788 |   const credit = await attribution.boundingBox(), panel = await page.locator('.rental-panel').boundingBox();
  789 |   expect(credit!.y).toBeGreaterThanOrEqual(panel!.y + panel!.height);
  790 |   await page.screenshot({ path: 'outputs/history-map-' + test.info().project.name + '.png', fullPage: true });
  791 | });
  792 | 
  793 | test('histories paginate beyond 100 rows, navigate back, recover an error and pay an older invoice', async ({ page }) => {
  794 |   test.setTimeout(60000);
  795 |   await seedHistory(pool, DEMO_USER_IDS.ru, '10000000-0000-4000-8000-000000000005', 105, loadBusinessConfig().serviceZone);
  796 |   await login(page);
  797 |   for (const view of ['trips', 'invoices'] as const) {
  798 |     await page.getByRole('navigation').first().getByRole('button', { name: view === 'trips' ? 'Поездки' : 'Счета', exact: true }).click();
  799 |     const nav = page.getByRole('navigation', { name: 'Страницы истории' });
  800 |     await expect(nav.getByRole('status')).toHaveText('Страница 1');
  801 |     const attr = view === 'trips' ? 'data-trip-id' : 'data-invoice-id';
  802 |     const read = () => page.locator('.history-entry').evaluateAll((rows, name) => rows.map(row => row.getAttribute(name)), attr);
  803 |     const first = await read(); expect(first).toHaveLength(20);
  804 |     await nav.getByRole('button', { name: 'Далее', exact: true }).click();
  805 |     await expect(nav.getByRole('status')).toHaveText('Страница 2');
  806 |     const second = await read(); expect(second.some(id => first.includes(id))).toBe(false);
  807 |     await nav.getByRole('button', { name: 'Назад', exact: true }).click();
  808 |     await expect(nav.getByRole('status')).toHaveText('Страница 1'); expect(await read()).toEqual(first);
  809 |     if (view === 'invoices') {
  810 |       await page.route('**/api/v1/invoices?*', route => route.fulfill({ status: 503, json: { code: 'TEMPORARY', message: 'test fixture', requestId: 'fixture' } }), { times: 1 });
  811 |       await nav.getByRole('button', { name: 'Далее', exact: true }).click();
  812 |       await expect(page.locator('.history-page').getByRole('alert')).toBeVisible();
  813 |       await page.locator('.history-page').getByRole('button', { name: 'Повторить', exact: true }).click();
  814 |       await expect(nav.getByRole('status')).toHaveText('Страница 2'); expect(await read()).toEqual(second);
  815 |       await nav.getByRole('button', { name: 'Назад', exact: true }).click();
  816 |       await expect(nav.getByRole('status')).toHaveText('Страница 1');
  817 |     }
  818 |     const seen = [...first]; let number = 1;
  819 |     while (await nav.getByRole('button', { name: 'Далее', exact: true }).isEnabled()) {
  820 |       await nav.getByRole('button', { name: 'Далее', exact: true }).click(); number++;
  821 |       await expect(nav.getByRole('status')).toHaveText('Страница ' + number);
  822 |       seen.push(...await read());
  823 |     }
  824 |     expect(seen.length).toBeGreaterThan(100); expect(new Set(seen).size).toBe(seen.length);
  825 |     if (view === 'invoices') {
  826 |       const last = page.locator('.history-entry').last();
> 827 |       await last.getByRole('button', { name: 'Оплатить в демо', exact: true }).click();
      |                                                                                ^ Error: locator.click: Test timeout of 60000ms exceeded.
  828 |       await page.getByRole('dialog').getByRole('button', { name: 'Оплатить в демо', exact: true }).click();
  829 |       await expect(page.getByRole('dialog').getByText('Оплачен', { exact: true })).toBeVisible();
  830 |       await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  831 |       await expect(last).toContainText('Оплачен');
  832 |       await page.screenshot({ path: 'outputs/history-pagination-' + test.info().project.name + '.png', fullPage: true });
  833 |     }
  834 |   }
  835 | });
  836 | 
```