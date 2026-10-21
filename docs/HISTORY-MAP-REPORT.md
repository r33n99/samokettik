# U019 — истории и навигация карты

Записано 2026-10-21T17:39:58.641+06:00. Основание — [точный запрос и дополнение](prompts/019-history-map.md). Дизайн сохраняет выбранный вариант «Карта» U013. Решение — D57 в [DECISIONS.md](DECISIONS.md).

| Требование | Реализация | Проверка | Результат |
| --- | --- | --- | --- |
| Все завершённые поездки доступны страницами | GET trips, UUID cursor, ended_at/id DESC, owner/finished filter,20 по умолчанию | Integration:105 records,7/page, ties+123µs, новая запись между страницами; E2E>100,Back/Next | Пройдено |
| Полная история счетов и старая оплата | GET invoices, created_at/id DESC; UI читает API, не первые100 из sync | Integration:обход105+ записей; E2E:оплата на последней странице за пределами100 | Пройдено |
| Валидация и изоляция | limit1–100, UUID cursor, owner subquery; unknown/foreign cursor→empty | Integration:empty/default20/invalid limits/cursor/extra query/foreign owner | Пройдено |
| Loading/error/offline/reconnect | AbortController, раздельные stacks, immediate loading/retry, refresh текущей страницы | E2E:реальный API + однократный503/retry; existing offline/reconnect/session tests | Пройдено |
| Кнопка активного самоката | «Показать свой самокат» выбирает activeId и фокусирует актуальную server GPS | Desktop/mobile reserved/riding browse, explicit locate | Пройдено |
| Выбор другого маркера без редиректа | marker click только selection; autoPanOnFocus=false; activeId/sync не перемещает карту | E2E:до/после клика центр маркера не сдвигается; своя бронь сохраняется; reconnect | Пройдено |
| Убрать Leaflet под зумом | prefix=false, control внизу; mobile sheet bottom24px | E2E:нет Leaflet, OSM link видим и ниже карточки; RU/KY live screenshots | Пройдено с ограничением ниже |
| Обновление существующего Compose | Drizzle0005, составные индексы, readiness6 | compose:up; before/after main IDs; live read-only через nginx/API/DB/WS | Пройдено; counts2/30/9/4/2 и все IDs сохранены |

Проверки: **44unit + strict typecheck + build,53PostgreSQL integration,34Playwright E2E**. Финальный полный browser прогон завершён 2026-10-21T17:39:50.804+06:00, exit0. Запущенный Compose: http://localhost:5173/, readiness/schema6. Live desktop1440×900 и mobile393×851:30markers, loaded tiles, no page errors/overflow; RU/KY карта и KY счета просмотрены,4актуальных env-secret отсутствуют в served JS/CSS.

Команды и реальные времена: [COMMANDS.json](evidence/history-map/COMMANDS.json), [live-smoke.json](evidence/history-map/live-smoke.json), [upgrade](evidence/history-map/main-upgrade.json). Неудачные прогоны сохранены: первый targeted2passed/2failed обнаружил отложенный loading/error при Retry (исправлено в hook); первый full33passed/1failed выбирал уже оплаченный desktop-сценарием invoice (исправлен test harness: unpaid+фиксированный invoiceId). Повторный full34passed, без retries.

Ограничения: видимая OSM attribution сохранена по [условиям текущих tiles](https://operations.osmfoundation.org/policies/tiles/#2-attribution-and-licensing); убран мешавший блок под zoom, строка перенесена к нижнему краю. Нет глобального числа страниц/count и snapshot на всё листание: новые записи появляются при перечитывании первой страницы, продолжение по cursor не сдвигается. Курсор — принадлежащая пользователю сохраняемая строка; неизвестный UUID даёт пустую страницу. Notifications/mailbox и private-sync snapshots остаются ограниченными100, их пагинация не входила в запрос историй поездок/счетов. KY подписи проверены визуально, отдельная носительская языковая экспертиза не выполнялась. Остальные ограничения U017 (реальная auth/Google/external SMTP) сохраняются. Реальный900s тест U017 повторно не запускался: reservation/deadline/billing/simulation код в U019 не изменён; полный регрессионный набор коротких тестов прошёл.

Git commit/push на этом этапе не выполнялись. Предлагаемый отдельный commit: `feat: paginate trip and invoice histories and preserve map browsing`.
