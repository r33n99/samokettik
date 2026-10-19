# Серверный цикл поездки — результаты U008

Записано 2026-10-19T17:28:51.780+06:00. [Точный запрос](prompts/008-trip-lifecycle.md), [правила и API](BILLING.md). Реализованы start из собственной брони, pause/resume, finish из riding/paused, серверная геозона, invoice и postpaid demo payment. Следующий этап не начат; commit/push по этому этапу не выполнялись.

## Критерии готовности

| Критерий | Доказательство |
| --- | --- |
| Стоимость считается правильно | Целочисленные ms/bigint и ceil-per-mode-v1: 0, 1, 59999, 60000, 60001 ms; крупные суммы и точность одной тыйыны. 61s riding + 10s paused = 1800 minor |
| Пауза тарифицируется отдельно | Непрерывные riding/paused интервалы, суммирование до округления; finish из paused. HTTP+PG fixture с дроблением движения/пауз даёт 2 активные минуты + 1 минуту паузы = 1800 minor |
| Сервер запрещает finish вне зоны | HTTP 409 OUTSIDE_SERVICE_ZONE при DB GPS на 1 E7 за ребром, rental и открытый interval сохранены, invoice отсутствует. После возврата на ребро и нового key finish успешен. Клиентские GPS в body дают 400 |

## Реальные проверки

- npm run verify: strict typecheck, **27 unit tests**, frontend/backend/contracts build — exit 0. Финальный typecheck после дополнений tests также exit 0.
- npm run test:db: **35 passed**, из них 14 trip/payment tests и прежние 21 foundation/reservation. Настоящий PostgreSQL, отдельная новая БД на каждый файл; не SQLite/mock. Миграции с нуля/повторный migrator, два HTTP API/pool, locks и SQL constraints.
- npm run compose:up: upgrade существующего volume до schema 3, migrate/seed exit 0, API/web/Postgres/worker healthy. Docker npm ci/build прошли; npm ci сообщил 0 vulnerabilities. Deprecated esm-loader/core-utils и npm install-script review notices остаются предупреждениями dev dependency toolchain; зависимости не менялись.
- npm run demo:trips: настоящий frontend nginx proxy → API → PostgreSQL; riding → paused → riding → finished, отклонённая и успешная demo payment, точный replay finish/pay.
- npm run test:e2e: **4 passed**, desktop/mobile, фактическая страница подключения и восстановление после readiness-ошибки. Это regression технического UI, не несуществующего UI поездки.
- Повтор db:generate: No schema changes. Старые 0000/0001 migrations не менялись; 0002 сгенерирована Drizzle Kit, проверена и дополнена exclusion constraint/extension и metadata DML до применения.

Последний live DB-read: 2026-10-19T17:26:24.915+06:00; SK-003, rental finished, invoice paid, 195 ms riding + 139 ms paused → 1000 тыйын / 10 сом. SQL независимо сверил суммы закрытых интервалов с invoice; одна receipt, ноль открытых интервалов. Zone snapshot bishkek-osm-8493930-2026-10-19; public API возвращает все четыре части OSM MultiPolygon.

## Конкурентность и восстановление

Два finish и два pay реально одновременно ожидали user-lock (проверка pg_stat_activity >=2 waiters), затем прошли через два API. Созданы один invoice и одна receipt. Повтор finish с тем же и новым key не начисляет повторно; повтор оплаты paid invoice возвращает прежнюю receipt. Один key используется во всех write endpoints пользователя, смена payload/operation запрещена; сохранённый отказ остаётся отказом. Для ошибки HTTP requestId новый, бизнес-результат сохраняется.

Принудительная ошибка INSERT invoice (trigger в изолированной test DB) возвращает 500 и откатывает rental, interval и cache. После снятия trigger тот же key успешно завершает поездку. Проверены SQL UNIQUE активных reserved/riding/paused, один открытый interval, EXCLUDE пересечений, CHECK арифметики и FK суммы оплаты. Начатая/paused поездка не освобождается по старому сроку брони. Start ждёт vehicle-lock и затем читает время заново: если срок истёк, создаётся expired, не riding.

Новый экземпляр API восстанавливает нарастающую длительность и исходный тариф/zone version из старой БД. Это проверка нового API и отсутствия клиентских команд, не заявление о новом полном PostgreSQL/server process outage test. Бронирования сохраняют прежний отдельный worker/restart test.

## Ограничения

Тарифы на границах минут проверены точными входными ms и подготовленными интервалами в изолированной DB; ожидание настоящей долгой поездки/15-минутной брони не выполнялось. Live demo использует реальные короткие задержки без подмены часов и стоит 10 сом по выбранному ceil правилу.

OSM snapshot — источник демонстрационной зоны, а не юридическое утверждение городской границы. Runtime structural/range/closed-ring/non-zero-area validation есть; самостоятельный GIS-аудит топологии административных данных не заявляется. Координаты пока статичны: симулятор, расход батареи, автоматический stop при 0%, outbox/email, WebSocket и продуктовый UI ещё отсутствуют. Auth — существующий явный локальный Bearer demo adapter, не Google/password. History endpoints ограничены последними 100 строками, без cursor pagination. Неоплаченный счёт не блокирует новую бронь — это правило не вводилось.

## Изменения и воспроизведение

- [Trip service](../apps/server/src/modules/trips/service.ts), [billing](../apps/server/src/modules/trips/billing.ts), [geofence](../apps/server/src/modules/trips/geofence.ts), [demo payment](../apps/server/src/modules/billing/service.ts).
- [Migration](../apps/server/drizzle/0002_trip_lifecycle.sql), [HTTP/PG tests](../tests/integration/trips.test.ts), [unit tests](../tests/unit/trips.test.ts).
- [Команды, времена и SHA-256](evidence/trips/checks.json), [фактическая БД](evidence/trips/live-database.json).

Следуйте README: npm ci → npm run setup → npm run compose:up; затем npm run demo:trips. Для проверки тарифов/геозоны/конкурентности: npm test и npm run test:db. Изменение env/config требует перезапуска API и worker; matching heartbeat обязателен.

Предлагаемый отдельный commit: feat: add trip lifecycle, geofence and exact billing. История не переписывалась, существующие audit docs сохранены и дополнены сообщением пользователя о ложной тревоге.

При финальной упаковке git diff --check обнаружил лишнюю пустую строку EOF в PROMPTS.md, exit 2. Исправлен только EOF документа; raw failed check сохранён. Это не failed app test. После исправления повторная export/whitespace проверка завершилась успешно: 205 source/evidence files, 29 Markdown, 72 доступных внутренних ссылки; текущие локальные секреты не обнаружены.
