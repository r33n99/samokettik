# СамоКеттик — аудит соответствия кейсу №11

**Объём уточнён U023:** прежняя оценка отсутствия auth/Google/KY/SMTP как обязательных недоработок больше не действует. Пользователь разрешил demo identities и локальную почту; новое подтверждение обязательных mail/warning сценариев — [MAIL-REVIEW.md](MAIL-REVIEW.md). Ниже сохранён исторический аудит U017 с его реальными временами.

Это сохранённый аудит U017. Последующий U019 закрывает указанное здесь ограничение пагинации R24/R25; актуальные изменения и результаты — [HISTORY-MAP-REPORT.md](HISTORY-MAP-REPORT.md). Остальные ограничения U017 сохраняются.

Записано 2026-10-21T16:33:15.664+06:00. Основание: [U017](prompts/017-case11-audit.md) и [исходное ТЗ](prompts/001-project-task.md). Проверяемая база — HEAD0f8ef30 плюс текущие незакоммиченные исправления аудита. **Полное исходное ТЗ ещё не выполнено**: R34/R35 не реализованы, R24/R25/R36/R43 имеют указанные границы. Внешняя SMTP-отправка не доказана; выбранная локальная эмуляция проверена. R40/R41 — дополнительные продуктовые предложения, не текст исходного кейса.

## Фактические прогоны

- verify:44unit,strict typecheck,build — exit0 (2026-10-21T16:29:09.992+06:00).
- PostgreSQL integration:51passed — exit0 (2026-10-21T16:27:06.451+06:00); реальная БД, два API/pool, process restarts, rollback/constraints.
- Playwright:30passed — exit0 (2026-10-21T16:29:59.213+06:00); desktop/mobile, API/worker/Vite/UUID DB; две real60s session-expiry проверки.
- Wall-clock acceptance:1passed — exit0 (2026-10-21T16:28:23.922+06:00), без подмены времени или дедлайнов.
- npm audit:0vulnerabilities; это не production security certification.
- Compose schema5: healthy; сохранены все существовавшие users/vehicles/rentals/invoices/payments. Live nginx/API/DB/WS smoke прошёл.

Полные команды, реальные start/end/exit и SHA-256 — [COMMANDS.json](evidence/case11-audit/COMMANDS.json). Failed runs не удалялись и описаны ниже.

## Матрица требований

Сокращения тестов раскрыты ссылками после таблицы. «ПРОЙДЕНО» относится к конкретно указанному сценарию и окружению; не означает все мыслимые нагрузки/сбои.

| Требование | Реализация | Тест | Результат |
| --- | --- | --- | --- |
| R01 Название, электросамокаты, Бишкек | React App, client-config из demo.json | EF: название/язык/30 markers | ПРОЙДЕНО |
| R02 Интерактивная Leaflet/OSM-карта | TransportMap, GeoJSON/OSM attribution, API coordinates | EF: map/list/zoom/tiles outage; live-smoke | ПРОЙДЕНО |
| R03 Свободен / забронирован / в поездке / недоступен | fleetSnapshot, runtime DTO и маркеры; paused остаётся in_ride | IR: lists 30; IT: keeps riding and paused occupied; ER | ПРОЙДЕНО |
| R04 Несколько клиентов синхронизируются | PostgreSQL NOTIFY → private/public snapshots, reconciliation | IW: broadcasts three clients across two APIs; ER: two contexts | ПРОЙДЕНО функционально; latency SLA/load не измерялся |
| R05 Минимальный заряд 15% | hasMinimumBattery учитывает bp и дробный остаток | US: 1500/1500 с remainder; IR low-charge; IW carry | ПРОЙДЕНО: 14,99% запрещён, 15% разрешён |
| R06 Бронирование доступного транспорта | reserveVehicle: user/vehicle/rental locks, constraints | IR: reserve/cancel, charge/maintenance; ER: real reserve | ПРОЙДЕНО; проверка зоны на start/finish, а не reserve |
| R07 Бронь действует 15 минут | DB clock после locks; saved expires_at = reserved_at+900s | AC: реальный 900s; IR: stored deadlines/time after lock | ПРОЙДЕНО без ускорения часов или deadline |
| R08 Уведомление за 3 минуты | saved warn_at=expires_at−180s; unique persistent warning | AC: реальная 12-я минута; IR/IW/ER warning | ПРОЙДЕНО: одно предупреждение, после restart не дублируется |
| R09 Неиспользованная бронь автоматически истекает | Отдельный worker; lazy cleanup как дополнительная защита | AC: DB-проверка expired без браузера; IR restart; ER expiry | ПРОЙДЕНО: ended_at ровно stored expires_at |
| R10 Нет двойного бронирования | PG locks + UNIQUE active user/vehicle | IR: два HTTP API 201/409 с lock barrier;20 service users через2pool; ER2contexts | ПРОЙДЕНО:1победитель/19конфликтов;20HTTP users не заявляется |
| R11 Start из собственной действующей брони | startTrip повторно проверяет owner/deadline/battery/maintenance/zone | IT: start/ownership/expiry/charge; ER lifecycle | ПРОЙДЕНО |
| R12 Pause/resume | Закрытие старого interval и учёт прежнего режима под locks | UT/UA/US; IT pause; ER slow requests/RU-KY/offline | ПРОЙДЕНО; геометрия панели стабильна |
| R13 Завершение поездки | finishLockedTrip атомарно закрывает interval/rental/invoice/outbox | IT: concurrent finish/retry/invoice failure rollback; ER finish | ПРОЙДЕНО |
| R14 Основной тариф8, пауза2 KGS/мин | Снимок тарифов800/200minor при start | UT/UA: независимый oracle; IT: paused intervals/config snapshot; ER invoice10 | ПРОЙДЕНО |
| R15 Поминутное округление без float ошибок | ceil-per-mode-v1: суммарное время каждого режима округляется отдельно; BigInt/bigint | UT: края60000±1ms/large integers; UA:300 комбинаций и30разбиений | ПРОЙДЕНО; дробление пауз не добавляет минут |
| R16 Автостоп при полном разряде | advanceSimulation считает depletionAt, общий атомарный finalizer | US exact depletion; IW riding/paused/outside/race/restart; ER depletion | ПРОЙДЕНО: после depletionAt начислений нет |
| R17 Счёт и причина в одном письме на завершение | UNIQUE invoice/outbox; local_mailbox + ack в одной PG-транзакции | IW: ack rollback/concurrent retry/restart/recipient/amount/reason; ER one mail | ПРОЙДЕНО локально; внешняя SMTP-доставка не реализована |
| R18 Запрет ручного завершения вне зоны | E7/BigInt Polygon/MultiPolygon, outer/holes/edges, server GPS | UT geometry; IT manual finish outside; ER trusted GPS fixture409→return200 | ПРОЙДЕНО; автостоп при0% допускается вне зоны |
| R19 Поездка продолжается без соединения клиента | Серверные intervals/simulation в БД; браузер только отображает | IW API down/worker restart; ER offline movement/restore | ПРОЙДЕНО |
| R20 Генерация и изменение GPS | 30seedLocations внутри зоны; saved geometric route/progress | UL: все4компонента зоны; US closed route; IW/ER movement | ПРОЙДЕНО; дорожный роутинг/реальные парковки не подтверждены |
| R21 Симуляция каждые3секунды | simulationTickMs3000 в конфиге; интеграция elapsed DB time | US delayed minute=20ticks; IW catch-up; config check | ПРОЙДЕНО номинально; poll/scheduling lag не hard realtime |
| R22 Изменение заряда | Riding100/paused20 bp/min; сохраняемые остатки/60000 | US fractional drain; IW charge carry across rentals/restart; ER offline | ПРОЙДЕНО |
| R23 Текущая бронь/поездка | Owner-only current/sync; server deadlines/cost; independent selection | IR/IT owner; ER booking/timer/ride/browse other/reconnect | ПРОЙДЕНО |
| R24 История завершённых поездок | Owner filter, finished only, details/Asia/Bishkek | IT history; ER lifecycle/history | ЧАСТИЧНО: последние100, cursor pagination отсутствует |
| R25 История счетов | Owner-only invoices и details/status | IT pay/owner; ER invoices | ЧАСТИЧНО: последние100, cursor pagination отсутствует |
| R26 Оплата по факту заглушкой | Separate demo approved/declined; invoice lock, UNIQUE receipt | IT concurrent approved/retry/declined; ER payment | ПРОЙДЕНО; реальный эквайринг не нужен и отсутствует |
| R27 Понятные ошибки/уведомления | TypeBox; code/requestId; RU/KY UI; loading/offline/pending | IR/IT forged input/unknown owner; EF errors; ER failed finish/lost response | ПРОЙДЕНО для UI; серверные mail/messages преимущественно RU |
| R28 Раздельные backend/frontend, сетевой API | Fastify/API,worker,React/Vite/nginx отдельными процессами/сервисами | E2E globalSetup real services/DB; Compose healthy; live-smoke | ПРОЙДЕНО |
| R29 Постоянный PostgreSQL | Миграции0000–0004, volume, сохранённые intervals/simulation/outbox | IF fresh/repeat migrations/seed; IW process restart; main-upgrade preserves IDs | ПРОЙДЕНО; аварийный restart самого PG/volume restore отдельно не имитировался |
| R30 Сервер проверяет переходы/время/стоимость | HTTP runtime validation; PG transactions/constraints; DB clock | IR/IT forged fields/status/price/time/GPS denied, direct constraints/rollback | ПРОЙДЕНО |
| R31 Восстановление после reconnect | REST before every WS, epochs, full snapshot, durable intent key | IW restore/restart; ER realtime/offline/reload/response lost/session expiry | ПРОЙДЕНО |
| R32 Документированный локальный запуск | README setup/Compose/migrations/seed/test commands | Current Compose upgrade+health; fresh UUID migrations; foundation historical clean run | ПРОЙДЕНО в этих границах; новый отдельный clean checkout в U017 не создавался |
| R33 Настройки в конфиге | BusinessConfig/validated env/client-config; rate/zone snapshots | UC invalid ranges; IF public config/no secrets; IT config snapshot | ПРОЙДЕНО |
| R34 Email+password авторизация | Есть только общий demo adapter/signed demo profile | Static review auth modules; IR disabled mode; UD explicitly demo only | НЕ РЕАЛИЗОВАНО: registration/password hashing/real sessions отсутствуют |
| R35 Google авторизация | OIDC/callback отсутствуют, credentials не настроены | Static review; реального Google smoke нет | НЕ РЕАЛИЗОВАНО; mock не выдан за Google |
| R36 Русский/кыргызский | UI/errors/fonts RU/KY; mail template сейчас RU | EF language/glyph evidence; ER RU/KY pause geometry; fonts cmap | ЧАСТИЧНО: KY письма и независимая языковая экспертиза отсутствуют |
| R37 Asia/Bishkek и KGS | UTC DB/API, explicit Asia/Bishkek render, integer minor units | UI-format/UT large money; EF/ER local view; config | ПРОЙДЕНО; mail timestamp остаётся явным ISO UTC |
| R38 30 демо-самокатов по зоне | Повторяемый seed и explicit idle redistribution | IF30+repeat; UL coverage/all components; IT active preservation; live30markers | ПРОЙДЕНО |
| R39 Минималистичный самостоятельный UI | Исследования Whoosh/Bolt,3варианта, выбор Карта U013, component SCSS | Сохранённые design-research, desktop/mobile screenshots; current browser tests | ПРОЙДЕНО; оценка дизайна субъективна |
| R40 Одна active rental на пользователя — принятое доп. правило | PG UNIQUE reserved/riding/paused | IR same user/two vehicles; IT paused occupies | ПРОЙДЕНО |
| R41 Долг блокирует бронь — только предложение E0 | Такое правило не вводилось | Не проверяется как обязательное требование исходного кейса | НЕ СОГЛАСОВАНО; не считать дефектом исходного кейса |
| R42 Идемпотентность повторов | Owner/key advisory lock, requestHash/result cache; unique finalization/payment | IR same/new key/conflict/rejection replay; IT finish/pay; ER lost response+reload | ПРОЙДЕНО |
| R43 Сбой серверов | Persistent worker/API restart/catch-up и readiness | IR worker restart; IW API down→worker restart→one invoice/mail; AC restart | ЧАСТИЧНО: PG outage/host crash/backup restoration не моделировались в U017 |
| R44 Изоляция пользователей и private WS expiry | Owner filters/single-use ticket; новый persisted auth deadline и close1008 | IW other user private empty + cross-API deadline regression; ER actual60s expiry | ПРОЙДЕНО для demo adapter; production auth остаётся R34/R35 |
| R45 Параллельные workers | Same lock order; SKIP LOCKED mailbox; unique logical events | IR two warning workers; IW depletion/finish race/ack rollback/retries | ПРОЙДЕНО |
| R46 Актуальное DB-время после lock | clock_timestamp после ожидания aggregate locks | IR cancel deadline; IT start after lock; AC actual deadlines | ПРОЙДЕНО |

Тестовые файлы:

- IR: [reservations.test.ts](../tests/integration/reservations.test.ts), IT: [trips.test.ts](../tests/integration/trips.test.ts), IW: [realtime.test.ts](../tests/integration/realtime.test.ts), IF: [foundation.test.ts](../tests/integration/foundation.test.ts).
- UT: [trips.test.ts](../tests/unit/trips.test.ts), UA: [audit-billing.test.ts](../tests/unit/audit-billing.test.ts), US: [simulation.test.ts](../tests/unit/simulation.test.ts), UL: [demo-locations.test.ts](../tests/unit/demo-locations.test.ts), UC: [config.test.ts](../tests/unit/config.test.ts), UD: [demo-session.test.ts](../tests/unit/demo-session.test.ts).
- EF: [foundation.spec.ts](../tests/e2e/foundation.spec.ts), ER: [rental.spec.ts](../tests/e2e/rental.spec.ts), reconnect: [realtime.spec.ts](../tests/e2e/realtime.spec.ts).
- AC: [reservation-clock.test.ts](../tests/acceptance/reservation-clock.test.ts), [конфигурация](../vitest.acceptance.config.ts).

Основная реализация: [reserve/cancel/idempotency](../apps/server/src/modules/reservations/service.ts), [trip transitions](../apps/server/src/modules/trips/service.ts), [billing](../apps/server/src/modules/trips/billing.ts), [finalizer](../apps/server/src/modules/trips/finalize.ts), [simulation](../apps/server/src/modules/simulation/service.ts), [jobs](../apps/server/src/jobs/transport.ts), [mailbox delivery](../apps/server/src/jobs/mail.ts), [realtime](../apps/server/src/modules/realtime/server.ts), [frontend state](../apps/web/src/state/useRentalApp.ts).

## Реальные15минут

[Сохранённые наблюдения](evidence/case11-audit/reservation-clock.json): reserve 2026-10-21T16:13:23.301+06:00; warn 2026-10-21T16:25:23.301+06:00; expiry 2026-10-21T16:28:23.301+06:00. Warning замечен 2026-10-21T16:25:24.393+06:00; worker перезапущен 2026-10-21T16:25:24.409+06:00; expired замечен 2026-10-21T16:28:23.791+06:00. Первый actual long run выполнил900s, одно warning и одно expired; DB ended_at строго равен expires_at, транспорт available. Poll наблюдения500ms, worker poll1000ms; тест допускает до5s lag обработки, а не обещает hard realtime.

Этот прогон стартовал на схеме4 до исправления private WS; логика reservation/expiry за аудит не менялась. Он проверяет неизменённую бизнес-логику900/180. Миграция/схема5 отдельно проверены fresh/repeat PG tests и полным E2E; новый15min прогон ради не связанного с бронью nullable auth-column не выполнялся.

## Найденные ошибки и исправления

1. **Private WS переживал срок browser credential.** До fix integration regression падал: закрытия после expiry не было. Добавлены auth_expires_at в ticket, handshake min(ticketTTL,bearer deadline), перенос auth deadline между API, таймер close1008 и защита flush до/после await. Новый тест выдаёт билет API A и погашает API B; E2E ждёт реальные60s, видит гостевой UI,401 старого bearer и восстанавливает ту же действующую бронь после свежего входа.
2. **Ошибки новой нагрузочной harness.** Наблюдатель сначала запрашивал насыщенный application pool; ранний выход оставлял promises и загрязнял следующий тест (2failed/18unhandled). Затем статистика pg_stat_activity кешировалась в удержанной транзакции. Исправлены observer через уже удержанное соединение, pg_stat_clear_snapshot и Promise.allSettled/finally. После исправлений51integration passed, unhandled errors нет. Это не объявлено production-дефектом бронирования.
3. **Новая E2E-проверка expiry имела неоднозначный sign-in locator.** Первый полный прогон28passed/2failed: после expiry есть кнопка и в header, и в карточке. Уточнён account-button locator, полный повтор30passed. Error-context сохранены в [failures](evidence/case11-audit/README.md); traces с временными credential не публикуются.

Миграция [0004](../apps/server/drizzle/0004_dapper_lilith.sql) создана Drizzle Kit и просмотрена;0000–0003 не изменены. Она инвалидирует только старые одноразовые tickets; активные аренды/счета/пользователи не удаляются. Main schema5 upgrade и сохранность записей: [main-upgrade.json](evidence/case11-audit/main-upgrade.json).

## Ограничения и оставшиеся риски

- Email/password и Google требуют отдельной реализации, включая production sessions/logout/rate limits и настоящий Google smoke с credentials. Demo profiles не закрывают эти требования.
- Локальное «ровно раз» основано на единой транзакции receiver+ack в PostgreSQL. Никакой результат здесь не доказывает SMTP exactly-once или доставку во внешний inbox.
- Истории ограничены100записями; нет cursor pagination. KY письма/нативная языковая экспертиза не выполнены.
- Нет hard-realtime/20HTTP-user нагрузочного SLA, PG-host-crash/power-loss/backup-restore теста и production security certification. Два HTTP пользователя,20 service пользователей и multiworker concurrency проверены в указанных границах.
- GPS/parking позиции синтетические; Polygon — сохранённый OSM snapshot, не юридическая граница и не street router.
- npm deprecated/allowScripts и FORCE_COLOR/NO_COLOR warnings сохранены в raw logs, не скрыты нулевым audit count.

## Повторение

Из работающего окружения по README: node scripts/check.mjs npm run verify; затем test:db, test:e2e и отдельно test:acceptance. Последний требует реальных15минут, PostgreSQL и права CREATE/DROP только своей UUID-базы; не включён в быстрый npm test. Отсутствие external credentials отмечается ограничением, не подменяется mock.

Коммит/push в этом этапе не выполнялись. Предлагаемый commit: test: audit case 11 and enforce private websocket session expiry.
