# СамоКеттик — матрица требований и проверок

Исходный запрос: [точный текст](prompts/001-project-task.md). После U002 реализован каркас, после U004 — серверная бронь, worker и persistent уведомления. После U008 реализованы серверные поездки/billing/demo payment и зона; UI ещё не реализован. Доказательства: [TRIPS-REPORT.md](TRIPS-REPORT.md). Статус `План` означает отсутствие доказательства выполнения. Частично выполненные инфраструктурные требования отмечены ниже; доказательства — [FOUNDATION-REPORT.md](FOUNDATION-REPORT.md) и [RESERVATIONS-REPORT.md](RESERVATIONS-REPORT.md). Открытые продуктовые решения нельзя автоматически превратить в принятые критерии.

Типы: U — Vitest unit, I — интеграционный тест с настоящим PostgreSQL/сетевым API, E — Playwright, M — ручная/операционная проверка. Сценарии без кода являются спецификациями тестов, не результатами. Соответствие этапов описано в [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

| ID | Требование | Критерий и способ проверки | Этап | Статус |
| --- | --- | --- | --- | --- |
| R01 | СамоКеттик; электросамокаты; Бишкек | M/E: название, тип и город верны, нет других типов транспорта | E8 | План |
| R02 | Карта Leaflet/OSM | E/M: 30 маркеров с реальными серверными координатами, выбор транспорта, pan/zoom; live tiles и attribution | E8–E9 | План |
| R03 | Четыре статуса транспорта | I/E: available/reserved/in_ride/unavailable, пауза остаётся in_ride; объяснение unavailable | E4–E8 | available/reserved/unavailable реализованы; in_ride/paused позже |
| R04 | Общее состояние нескольких клиентов | I/E: минимум два независимых BrowserContext; после commit изменения видны обоим, целевой штатный WS lag <=2 s | E6,E8,E9 | План |
| R05 | Минимальный заряд 15% | I: 14,99% отклонено, ровно 15% разрешено; повторная проверка на start; низкий заряд не скрыт только CSS | E4 | Бронь: 14,99% отклонён, 15% разрешён; start повторно проверяет charge/mode, что проверено HTTP+PG |
| R06 | Бронирование доступного транспорта | I/E: владелец видит активную бронь, занятому/неисправному/вне зоны — конфликт | E4,E8 | Атомарные reserve/cancel и maintenance/charge проверены; зона/UI позже |
| R07 | Срок брони 15 минут | I: expires_at=reserved_at+900s; на границе 899999/900000ms; время берётся после блокировки | E4 | 900s/180s сохранены; проверено время после lock; полный 15-min wall-clock прогон позже |
| R08 | Уведомление за 3 минуты | I/E: одно warning при warn_at=expires_at-180s; online доставка, offline запись; устаревшее warning не создаётся после expiry | E6,E8 | Одна persistent warning по DB-clock, два worker и restart проверены; REST owner-only, WS/UI позже |
| R09 | Автоматическое истечение брони | I: worker закрывает reserved после срока; после restart обрабатывает backlog; не закрывает уже riding | E6 | Expiry, restart, cancel race и live освобождение проверены; worker не закрывает начатую/paused поездку после старого deadline |
| R10 | Нет двойного бронирования | I: barrier-start 20–50 разных users, pool>1, один vehicle, при необходимости два API; один 2xx, остальные 409; SQL count(active)=1 | E4,E9 | Два HTTP user через два API/pool с PG-barrier: 201/409, одна row; 20–50 user load test позже |
| R11 | Начало поездки | I/E: только собственная reserved до дедлайна, нельзя стартовать чужую/expired/низкий заряд; один открытый riding interval | E5,E8 | Серверный start из действующей собственной брони, charge/mode/zone и истечение проверены; UI позже |
| R12 | Пауза и возобновление | U/I/E: riding→paused→riding; valid transitions; charge/движение и billing по прежнему режиму до t | E5,E6,E8 | Серверные pause/resume, точные непрерывные интервалы и запрет неверных переходов проверены |
| R13 | Завершение | I/E: riding/paused→completed, закрытый интервал, один invoice; повтор и конкурентный finish не дублируют результат | E5 | Finish из riding/paused атомарно создаёт один invoice; concurrent/new-key/same-key finish проверены |
| R14 | Основной тариф 8 сом/мин, пауза 2 | U/I: 60s riding=800 minor, 60s paused=200, 90s+30s=1800; сохранённый rate snapshot | E5 | 800/200 minor units; ceil отдельно по суммарным mode ms, bigint и границы минуты проверены; BILLING.md |
| R15 | Денежные расчёты без float-ошибок | U/I: ceil каждой суммарной mode-длительности до минут, целые minor units без float; сумма не зависит от разбиения интервалов | E5 | BigInt и SQL bigint, ceil-per-mode-v1 без float; 0/59999/60000/60001ms, split invariance и большие суммы проверены |
| R16 | Автостоп при 0% | U/I/E: tick и finish одновременно, depletion внутри tick/простоя, stop в riding/paused; нет начисления после depletion_at | E6 | План: разряд, depletion и автоматический stop ещё не реализованы |
| R17 | Письмо со счётом/причиной автостопа ровно раз | I/M: один invoice/outbox; crash после приёма письма до ack, restart и retry; проверить получателя, сумму, locale, battery_depleted | E7,E9 | Открыт почтовый транспорт/граница гарантии |
| R18 | Запрет ручного финиша вне зоны | U/I/E: inside/outside/edge/vertex/hole/MultiPolygon, актуальный серверный GPS; автостоп вне зоны разрешён | E5,E6,E8 | Server finish вне polygon запрещён (409), граница разрешена; DB GPS, holes/MultiPolygon unit tests; автостоп/UI позже |
| R19 | Продолжение поездки при потере клиента | I/E: закрыть WS/браузер, дождаться изменения координат/заряда и суммы; восстановиться с другого клиента | E6,E9 | Elapsed time и тарифы восстанавливаются на новом API без клиента; GPS/заряд/WS и браузер поездки позже |
| R20 | Генерация/изменение GPS | U/I: seeded позиции внутри зоны, e7/GeoJSON порядок, законные пределы; маршрут и прогресс переживают restart | E2,E6 | План |
| R21 | Симуляция каждые 3 секунды | I/M: simulationTickMs=3000, отсутствие overlapping cycles, задержанный tick не меняет скорость/длительность | E6 | План |
| R22 | Изменение заряда | U/I/E: riding/pause разные коэффициенты; carry дробного остатка; charge 0..10000; остановка при 0 | E6 | План |
| R23 | Текущая бронь/поездка | I/E: текущая собственная rental, корректный timer, pause, reconnect; чужая информация недоступна | E4–E8 | GET current возвращает собственную reservation/trip, elapsed/стоимость серверные; UI позже |
| R24 | История поездок | I/E: только completed, owner filter, pagination, время Asia/Bishkek; отмены не выданы как поездки | E5,E8 | GET /trips: последние 100 собственных завершённых поездок; UI/pagination позже |
| R25 | История счетов | I/E: сумма/статус/причина/детали, owner filter, pagination, неизменность после config change | E5,E7,E8 | GET /invoices: последние 100 собственных счетов; UI/pagination позже |
| R26 | Оплата по факту заглушкой | I/E: успех/отказ, retry после отказа, двойной pay с разными keys → один success; реальные карты не используются | E7 | Локальная postpaid заглушка approved/declined, транзакция и UNIQUE receipt, concurrent/replay проверены; без эквайринга |
| R27 | Понятные ошибки/уведомления | I/E: runtime validation, стабильные code/requestId, RU/KY сообщения, без SQL/stack, unavailable reason и offline state | E3–E9 | API 400/401/404/409/503 и private notices проверены; тексты пока RU, UI/KY позже |
| R28 | Раздельные frontend и backend по сети | I/M: отдельные Compose services, реальные HTTP/WS, backend не заменён mock/localStorage | E1,E9 | Отдельные API/frontend/worker, HTTP+PG+Compose проверены; WS позже |
| R29 | Постоянное PostgreSQL-хранилище | I/M: restart контейнеров с volume сохраняет accounts/rental/invoice; миграции с нуля и повторный запуск | E2,E9 | Миграции с нуля/повтор и upgrade Compose до v3 проверены; rental/interval/invoice/payment persistent, новый API читает поездку |
| R30 | Серверные переходы и стоимость | I: forged price/status/time/userId/GPS не принимаются; обход UI прямым API не обходит правила | E4–E7 | Валидация переходов и стоимости/времени/координат на сервере; forged inputs отклоняются; SQL constraints и rollback проверены |
| R31 | Восстановление актуального состояния | I/E: disconnect, missed event, API/worker restart, out-of-order HTTP snapshot; full reconciliation | E6,E8,E9 | REST current и durable replay после нового API/worker проверены; WS resync позже |
| R32 | Документированный локальный запуск | M: чистый checkout, .env.example, Compose build/migrate/seed, demo accounts, два клиента; инструкции Windows и типовые ошибки | E9 | README Compose v3 и demo:trips через frontend proxy проверены; готового trip UI ещё нет |
| R33 | Конфигурируемые значения | I/M: все заданные параметры имеют один источник, invalid config останавливает start; API/worker hash; snapshots не меняются | E1,E2 | Config/env, deadlines/minimumBatteryBp и fare/zone snapshots; старые trip snapshots после нового API/config проверены |
| R34 | Email/password | I/E: регистрация/вход/выход, hash, cookie, неверный пароль, истечение сессии, protected routes, rate limit | E3 | План |
| R35 | Google | I/M: реальный OIDC, state/nonce/token checks, callback, новый/existing user, без auto-link по email; один настоящий smoke login | E3,E9 | Внешняя зависимость: credentials |
| R36 | RU/KY | E/M: язык всех действий/ошибок/уведомлений/писем, actual glyphs Ңң Өө Үү; содержательная проверка переводов | E7,E8,E9 | План |
| R37 | Asia/Bishkek и KGS | U/I/E: UTC persistence, ISO API, local render +06:00; minor units, ru/ky money formatting | E2,E5,E8 | UTC persistence, ISO timestamps, KGS и integer minor amounts проверены; local UI money/time formatting позже |
| R38 | 30 демонстрационных самокатов | I/M: seed повторяем, ровно 30, нет дублей, распределены по зоне, разные заряды, свободные/недоступные | E2,E6 | 30 seed rows и разные заряды; occupied статус охватывает riding/paused; full OSM зона сохранена, движения ещё нет |
| R39 | Минимализм с самостоятельным дизайном | M/E: опубликованные аналоги, записанный анализ, несколько вариантов до кода, выбранный вариант, desktop/mobile review | E8 | План |
| R40 | Одна active rental на user — предлагаемое правило | I: параллельные разные vehicles от одного user → одна active rental; paused тоже занимает лимит | E4 | Одна активная reserved/riding/paused на user, общий SQL UNIQUE; paused лимит проверен |
| R41 | Долг блокирует новую бронь — предлагаемое правило | I/E: unpaid блокирует reserve; paid разрешает; invoice создаётся до снятия блокировки user в finish | E4,E7 | На согласовании |
| R42 | Повторяемость команд | I: один key/same body повторяет результат; другой body=409; crash commit→response; новые key не дублируют finish/pay | E4–E7 | Reserve/cancel/start/finish/pay replay, operation/payload conflict, concurrent finish/pay и повтор с новым key проверены |
| R43 | Сбой серверов | I/M: API остановлен отдельно от worker; worker downtime catch-up; PG outage без ложного 2xx; после восстановления reconciliation | E6,E9 | Бронь/уведомления восстанавливаются после worker process и HTTP API restart; политика downtime поездки позже |
| R44 | Изоляция пользователей | I/E: чужие rentals/invoices/notifications/mail недоступны, fleet/WS не раскрывает owners; logout/expiry закрывает WS | E3,E6–E9 | Чужие trip/payment дают 404, чужие histories пусты; sessions/logout/WS позже |
| R45 | Конкурентный worker | I: два worker, гонки warning/start/expiry и finish/depletion; idempotent outcomes и отсутствие двойного списания | E6,E7,E9 | Два reservation worker cycle/pool, warning/expiry/cancel races проверены; ride/payment jobs позже |
| R46 | Актуальное время после ожидания lock | I: искусственно удержать user/vehicle lock через expires_at; start получает expired, не stale now() | E4,E9 | Cancel и start читают DB-время после ожидания vehicle lock; истёкший start запрещён |
| P01 | Маленькие этапы и контроль пользователя | M: каждый этап имеет exit criteria; после него агент ждёт отдельную команду | Все | U008: выполнен только серверный цикл поездки/счёт/demo payment; следующий этап требует команды |
| P02 | Нет функционального кода на текущем этапе | M: только Markdown-документы и скрипты проверки/экспорта документов в work; нет package/migrations/app/compose | E0 | Проверено аудитом документов, см. WORKLOG |
| P03 | WORKLOG/DECISIONS/PROMPTS/REQUIREMENTS | M: документы E0, реальные ISO timestamps; ссылки на сохранённые промпты | E0 и далее | Проверено наличие/ссылки/формат timestamps, см. WORKLOG |
| P04 | Типизация и валидация | I/M: strict tsc, DTO runtime validation, ограниченные inputs, нет any для обхода границ | E1 и далее | Strict tsc включая tests/tools; runtime input/DTO/config validation, деньги/длительности decimal strings |
| P05 | Атомарные критические операции | I/M: SQL-ограничения и транзакции, race tests на PostgreSQL, не SQLite mock | E2,E4–E7 | Reservation/trip/interval/invoice/payment/cache транзакционны; SQL UNIQUE/CHECK/FK/EXCLUDE и injected rollback test |
| P06 | Честные результаты и источники | M: план/запуск/результат разделены; failing tests сохранены; sources и ограничения в документации | Все | Фактические команды/время/результаты и ограничения сохранены; исторические failed runs не удалялись |
| P07 | Git без фиктивной истории | M: перед commit identity check; author=committer=user, без AI coauthor, без history rewrite; коммит только реально выполненного этапа | Все | Первый реальный commit 4d6bdcd опубликован в private r33n99/samokettik по U006; author=committer=пользователь, без history rewrite |
| P08 | SCSS и библиотечные примитивы | M: раздельные SCSS modules, @use/@forward; нет готового библиотечного дизайна | E8 | Открыто отклонение от Tailwind |

## Контрольный демонстрационный сценарий

1. Чистый запуск по README; показать миграции, seed, здоровье API/worker и 30 самокатов.
2. Два пользователя открывают один fleet; одновременно бронируют один самокат. Успех у одного, другой получает объяснимый конфликт; обе карты обновились.
3. Владелец начинает, ставит на паузу, возобновляет; другой клиент видит занятость. Закрыть клиент владельца, показать продолжение на сервере, войти снова.
4. Дойти до границы зоны на demo route: обычный finish снаружи отклонён; вернуть маршрут в зону, завершить, сверить тариф/интервалы/счёт.
5. Оплатить заглушкой: отказ, затем успех; повторить успешный запрос и проверить единственный платёж.
6. Новая бронь: warning на 12-й минуте, expiry на 15-й. Быстрые автоматические тесты используют другую тестовую конфигурацию; хотя бы один полный 15-минутный прогон идёт с реальными демонстрационными настройками.
7. Поездка с разрядом до 0%, включая pause/outside; показать ровно один invoice и письмо с причиной. Воспроизвести crash mail-ack window для выбранного транспорта.
8. Перезапуск API/worker/БД с сохранением volume и восстановление состояния. Проверить RU/KY и mobile/desktop.

## Правила принятия результатов

После реализации к строкам добавляются точная команда, timestamp, exit code и артефакт/лог. Зелёный tsc не подтверждает R10, mock БД не подтверждает конкурентность, два компонента в одной вкладке не заменяют два независимых клиента, одна outbox-строка не доказывает SMTP exactly-once. При отсутствии внешних ключей/доступа R35 и внешний mail smoke-check остаются открытыми.
