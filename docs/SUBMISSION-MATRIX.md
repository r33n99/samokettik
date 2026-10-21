# Матрица сдачи кейса №11

U021. Это актуализация исторического U017 после U019. Статус относится только к указанным проверкам; не означает production readiness. R40/R41 — дополнительные продуктовые предложения, не обязательные требования исходного кейса. Полный новый результат — [SUBMISSION.md](SUBMISSION.md), [raw evidence](evidence/submission/README.md). AC — **исторический** реальный900s прогон U017, не повторённый на U021; другие сокращения раскрыты ниже.

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
| R24 История завершённых поездок | Cursor API owner/finished,ended_at+id,20/default,Next/Back | IT >100/ties/123µs/new insert; ER navigation | ПРОЙДЕНО U019/U021; без лимита100 |
| R25 История счетов | Cursor API owner,created_at+id; оплата старого invoice | IT >100/owner/limit validation; ER >100/Back/retry/old payment | ПРОЙДЕНО U019/U021 |
| R26 Оплата по факту заглушкой | Separate demo approved/declined; invoice lock, UNIQUE receipt | IT concurrent approved/retry/declined; ER payment | ПРОЙДЕНО; реальный эквайринг не нужен и отсутствует |
| R27 Понятные ошибки/уведомления | TypeBox; code/requestId; RU/KY UI; loading/offline/pending | IR/IT forged input/unknown owner; EF errors; ER failed finish/lost response | ПРОЙДЕНО для UI; серверные mail/messages преимущественно RU |
| R28 Раздельные backend/frontend, сетевой API | Fastify/API,worker,React/Vite/nginx отдельными процессами/сервисами | E2E globalSetup real services/DB; Compose healthy; live-smoke | ПРОЙДЕНО |
| R29 Постоянный PostgreSQL | Сохранённые миграции0000–0005,schema6,volume; elapsed state | U021 новая PG18.6 DB/migrate/seed×2; IF; IW restart | ПРОЙДЕНО; host crash/backup restore не проверены |
| R30 Сервер проверяет переходы/время/стоимость | HTTP runtime validation; PG transactions/constraints; DB clock | IR/IT forged fields/status/price/time/GPS denied, direct constraints/rollback | ПРОЙДЕНО |
| R31 Восстановление после reconnect | REST before every WS, epochs, full snapshot, durable intent key | IW restore/restart; ER realtime/offline/reload/response lost/session expiry | ПРОЙДЕНО |
| R32 Документированный запуск | README Docker и host dev; contracts build перед host seed/check | U021 git archive b7a6c75:новые .env/dependencies/volume/ports; Compose и dev smoke | ПРОЙДЕНО после исправления пропущенного шага README; Docker cache доступен |
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
| R43 Сбой серверов | API/worker restart/catch-up,readiness | IR/IW/AC; U021 clean origin-independent PG tests | ЧАСТИЧНО: авария PG/хоста и backup restore не моделировались |
| R44 Изоляция и private WS expiry | Owner filters,PG tickets/auth deadline,close1008 | IW cross-API/owner/expiry и собственная Origin fixture; ER реальные60s | ПРОЙДЕНО для demo adapter; auth R34/R35 отсутствует |
| R45 Параллельные workers | Same lock order; SKIP LOCKED mailbox; unique logical events | IR two warning workers; IW depletion/finish race/ack rollback/retries | ПРОЙДЕНО |
| R46 Актуальное DB-время после lock | clock_timestamp после ожидания aggregate locks | IR cancel deadline; IT start after lock; AC actual deadlines | ПРОЙДЕНО |

Тестовые файлы:

- IR: [reservations.test.ts](../tests/integration/reservations.test.ts), IT: [trips.test.ts](../tests/integration/trips.test.ts), IW: [realtime.test.ts](../tests/integration/realtime.test.ts), IF: [foundation.test.ts](../tests/integration/foundation.test.ts).
- UT: [trips.test.ts](../tests/unit/trips.test.ts), UA: [audit-billing.test.ts](../tests/unit/audit-billing.test.ts), US: [simulation.test.ts](../tests/unit/simulation.test.ts), UL: [demo-locations.test.ts](../tests/unit/demo-locations.test.ts), UC: [config.test.ts](../tests/unit/config.test.ts), UD: [demo-session.test.ts](../tests/unit/demo-session.test.ts).
- EF: [foundation.spec.ts](../tests/e2e/foundation.spec.ts), ER: [rental.spec.ts](../tests/e2e/rental.spec.ts), reconnect: [realtime.spec.ts](../tests/e2e/realtime.spec.ts).
- AC: [reservation-clock.test.ts](../tests/acceptance/reservation-clock.test.ts), [конфигурация](../vitest.acceptance.config.ts).

Основная реализация: [reserve/cancel/idempotency](../apps/server/src/modules/reservations/service.ts), [trip transitions](../apps/server/src/modules/trips/service.ts), [billing](../apps/server/src/modules/trips/billing.ts), [finalizer](../apps/server/src/modules/trips/finalize.ts), [simulation](../apps/server/src/modules/simulation/service.ts), [jobs](../apps/server/src/jobs/transport.ts), [mailbox delivery](../apps/server/src/jobs/mail.ts), [realtime](../apps/server/src/modules/realtime/server.ts), [frontend state](../apps/web/src/state/useRentalApp.ts).


Текущие46 строк не сворачиваются в «100%»: R34/R35 не реализованы, R36 частично, R43 ограничен проверенными сбоями. R17 локальный exactly-one не означает SMTP exactly-once; это отдельно обозначенное решение. R41 не согласовано, поэтому отсутствие debt gate не объявляется дефектом исходного задания.
