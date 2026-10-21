# Готовность к сдаче — СамоКеттик

Записано 2026-10-21T19:59:15.759+06:00, этап [U021](prompts/021-submission.md). **Готов к воспроизводимой локальной демонстрации основного кейса. Полное исходное ТЗ ещё не выполнено.** Отдельно не реализованы email/password и Google-авторизация, кыргызские письма/полная языковая приёмка. Локальная эмуляция почты проверена, внешняя SMTP-доставка не заявляется. Нельзя представлять общие demo profiles как production accounts.

## Что передано

[README](../README.md) с зависимостями, чистой установкой, Docker/host dev, миграциями/seed, profiles и тестами. [Текущая архитектура](ARCHITECTURE.md) и [сохранённое предложение E0](ARCHITECTURE-PROPOSAL.md). [Матрица46требований](SUBMISSION-MATRIX.md), [критерии и хронология](REQUIREMENTS.md), [сценарий двух клиентов](DEMO.md), [22прямых npm packages, generators/лицензии/заимствования](DEPENDENCIES.md), [решения](DECISIONS.md), [реальный журнал](WORKLOG.md), [точные запросы U000–U021](PROMPTS.md). Прошлые времена/failed runs не изменялись, ранние предложения больше не выданы за текущий код.

## Реальная новая проверка

Чистый источник: git archive **b7a6c7541650c968490dc6c2874633da67308227**, новая папка без .env/node_modules/dist. Выполнены npm ci, setup×2 (второй сохранил env), отдельный Compose project/new PG volume, новые случайные credentials и ports5190/3190/54339. Использовался доступный Docker layer cache; полностью uncached host/Linux install не имитировался. Source overlay — только исправление WS integration fixture с SHA256, production app/config/SQL/package-lock не менялись. Документация подготовлена поверх этого исходника; на момент завершения U021 она ещё не была в Git-коммите. Публикация отдельно разрешена U022.

| Проверка | Результат | Реальный конец команды |
| --- | --- | --- |
| npm ci в пустой копии | Установлено146packages/audited150,exit0; upstream deprecation warnings сохранены | 2026-10-21T19:41:52.934+06:00 |
| setup×2 | Созданы новые secrets; повтор побайтно сохранил значения | 2026-10-21T19:41:53.693+06:00 |
| Новый Compose + PostgreSQL | migrate/seed exit0; web/API/worker/postgres healthy; schema6 | 2026-10-21T19:42:24.489+06:00 |
| Host contracts/migrate/seed×2/db:check | После исправления README passed; PG18.6,30vehicles/2users | 2026-10-21T19:43:27.337+06:00 |
| verify | Strict typecheck,44unit и production build passed | 2026-10-21T19:43:53.030+06:00 |
| Повторный typecheck после test patch | Passed | 2026-10-21T19:50:34.812+06:00 |
| PostgreSQL integration | 53passed,реальные HTTP/locks/constraints/две API/worker recovery | 2026-10-21T19:51:14.739+06:00 |
| Playwright | 34passed,desktop/mobile,real API/worker/Vite/UUID DB | 2026-10-21T19:47:55.455+06:00 |
| npm audit |0vulnerabilities; ограниченный снимок advisories | 2026-10-21T19:43:31.493+06:00 |
| CLI reservations/trips/realtime/mail |201/409 + replay; riding/paused/riding/finished; invoice1000minor и payment replay;3WS + owner disconnect;1mail/1notice на finish | 2026-10-21T19:51:24.808+06:00 |
| npm run dev + browser smoke | API/worker ready6;30markers/loaded tiles,no page errors/overflow на1440×900 и393×851 | 2026-10-21T19:53:22.498+06:00 |
| Gitleaks8.30.1 |6commits и подготовленный snapshot:0findings,exit0 | См.COMMANDS.json |
| Точные текущие secrets двух env |633reachable blobs и541publishable files;0совпадений literal/URI/base64; .env в истории отсутствует | 2026-10-21T19:56:42.829+06:00 |

[Raw logs и SHA256](evidence/submission/COMMANDS.json). [Dev desktop](evidence/submission/dev-desktop.png), [mobile](evidence/submission/dev-mobile.png). Повторный полный E2E после изменения **только integration fixture** не запускался: production/E2E source не менялись, их новый34passed результат относится к тому же исходнику. Реальный900s acceptance U017 не повторялся; [исторические точные сроки/ограничения](CASE11-AUDIT.md) сохранены и не выдаются за новый запуск.

## Найдено и исправлено

1. **README host flow падал после npm ci.** db:seed импортировал отсутствующий contracts/dist. В README перед host seed/check/dev добавлена явная сборка contracts; повтор в той же чистой копии и npm run dev прошёл. Полный Docker flow уже собирал contracts и был исправен.
2. **WS integration зависел от Origin основного demo.** На отдельном5190 host первый PostgreSQL run:48passed/5failed c timeout. Fixture посылал5173, но наследовал allowlist5190. Теперь тест явно задаёт собственный origin и передаёт его child API/worker; server validation не ослаблена. Повтор53passed. Тестовый patch отдельно записан в source-overlay.json.
3. Устаревшие тексты «последние100», «pagination ещё нет», «текущий U004» и смешение E0/current архитектуры устранены в актуальных документах. Исторические отчёты/сохранённые prompts не переписаны задним числом.

## Реализованный объём

Серверная бронь900s/warning180s/expiry/min charge15%, PostgreSQL атомарность и идемпотентность; start/pause/resume/finish и целые деньги с отдельным ceil-per-mode; polygon geofence; сохранённая GPS/charge simulation и depletion finalization; REST recovery/public-private WS; invoice/demo approved-declined payment; один логический local mailbox mail. Frontend:30distributed markers/geozone/list/card,active locate без перехвата выбора,loading/error/offline/reconnect,RU/KY,полная cursor history/old invoice payment. Условия и тесты по каждому пункту — отдельная матрица, а не общий рекламный «готово».

## Оставшиеся задачи и разумный порядок

1. **Обязательное ТЗ:** email/password (регистрация/hash/session/logout/rate limits/защита) и настоящий Google OIDC со state/nonce/callback/token checks; реальные account isolation/smoke tests. Сейчас есть только demo identities, даже при наличии HMAC/WS expiry.
2. **Обязательная локализация:** KY mail/понятные серверные сообщения и независимая содержательная языковая проверка. Cmap/рендер RU/KY fonts проверены, но не заменяют носителя языка.
3. **Почта:** если требуется внешний email, выбрать transport/provider и документировать его idempotency contract; локальная PG mailbox exactly-one не доказывает external SMTP exactly-once. В текущем demo внешняя отправка не нужна для выбранной эмуляции.
4. **Для эксплуатации:** отдельные минимальные PG roles, session/secrets lifecycle/TLS, pruning dev tooling из runtime image, CI и backup/restore, мониторинг queue lag/worker health. PG outage/host power loss/restore не проверены; API/worker restarts/catch-up проверены. Нагрузочный SLA/20HTTP-user benchmark не измерялся,20service-users race не выдаётся за него.
5. **Продуктовые улучшения:** дорожные маршруты/зоны парковки и более реалистичная телеметрия; pagination notifications/mailbox при необходимости (их snapshot100 ограничен); очистка старых idempotency/tickets/outbox по выбранной retention policy. Payment остаётся намеренно заглушкой. Debt gate — дополнительное несогласованное правило, не обязательный дефект.

## Секреты, Git и передача

Сканеры и точное сравнение не находят известных текущих секретов в проверенном объёме; это не гарантия отсутствия неизвестного или ранее сменённого секрета. .env/work/node_modules/dist/traceZIP не входят в передачу. В bundle проверки U019 сохранены; на U021 production frontend bundle не менялся. Внешний Generic Password incident ранее назван пользователем ложной тревогой; новый Gitleaks не устанавливает неизвестный GitGuardian location.

База проверки U021: Git HEAD **b7a6c75**, branch main. На старте U021 дерево было чистым; на момент завершения U021 имелись ожидаемые незакоммиченные README/docs/evidence и один integration-test patch. Staged files0, история/зависимости/применённые миграции не переписывались; commit/push по U021 не выполнялись. Предлагаемый commit: **docs: prepare reproducible submission and isolate websocket test origins**. После отчёта U021 пользователь отдельно разрешил commit/push командой U022; момент фактической публикации проверяется по Git, исторические результаты выше относятся к указанной базе.

Проверочный Compose project/volume удалены после smoke; основной samokettik API/worker/web/postgres healthy, migrate/seed exit0. Новых бизнес-записей в main этот этап не создавал: CLI/browser scenarios выполнялись только на отдельном стенде/UUID DB. Игнорируемая копия с установленными dependencies остаётся в work для воспроизведения, её env не передаётся.

Финальная проверка всех подготовленных файлов/ссылок/неизменности production source и SQL: [validation.json](evidence/submission/validation.json). После подготовки итоговых документов snapshot повторно просканирован Gitleaks; результат0findings и новое реальное время сохранены в COMMANDS.json.
