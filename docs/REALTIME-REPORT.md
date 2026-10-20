# Отчёт U010: симулятор, фоновые задачи, WebSocket, локальная почта

Отчёт фиксирует выполненное по [заданию](prompts/010-simulation-realtime.md). Реальное время каждой команды, exit code и SHA-256 — [COMMANDS.json](evidence/realtime/COMMANDS.json); работа начата 2026-10-20, проверки продолжены 2026-10-21, timezone +06:00. Это время работы, не выдуманная дата отправки пользовательского сообщения. Commit/push текущего этапа не выполнялись.

## Полученный результат

Отдельный worker хранит маршрут/anchor/расход/дробные остатки в PostgreSQL. Поездка движется и теряет заряд без вкладки и без API; пауза неподвижна, расходует отдельный коэффициент. При разряде общий атомарный finalizer закрывает поездку в расчётную ms, создаёт один invoice, private notification и outbox. Ручной finish вне зоны запрещён; автостоп возможен в любой точке. Поминутные тарифы и idempotency сохранены.

WebSocket public/private читает committed snapshots после PG NOTIFY, периодически сверяется и работает через nginx/Vite. Browser SDK перед reconnect читает API и игнорирует устаревшие ответы/кадры. Техническая страница показывает живой fleet и состояние соединения; полноценный rental UI не добавлялся. Private ticket одноразовый/короткоживущий, SHA256 в БД, bearer/ticket не размещаются в URL. Public fleet не раскрывает пользователя/счёт/уведомления/письма.

Выбрана локальная почтовая эмуляция **в PostgreSQL**, без SMTP и отдельного Mailpit. Mailbox acceptance и outbox ack коммитятся вместе, UNIQUE запрещает второе письмо по invoice. Гарантия относится к одному сохранённому локальному письму, а не внешней отправке. Письмо доступно через owner API и mail:show, содержит сумму и причину manual/depleted; только RU. Детали/альтернативы — [D42–D48](DECISIONS.md), контракт — [SIMULATION-REALTIME.md](SIMULATION-REALTIME.md).

## Выполненные проверки

| Команда / доказательство | Результат | Проверенное поведение |
| --- | --- | --- |
| [npm run verify](evidence/realtime/logs/2026-10-21T00-17-39.754+06-00-npm.log) | exit0: typecheck, **32 unit**, production build | BigInt расход/остатки/точный depletion; splitting ticks; zero/paused/movement; прежние billing/geofence/config tests |
| [npm run test:db](evidence/realtime/logs/2026-10-21T00-23-54.871+06-00-npm.log) | exit0: **43 PostgreSQL integration**, 4 files | Старые 35 плюс 8 realtime/simulation/mail сценариев, настоящие транзакции/HTTP/WS/child processes |
| [npm run test:e2e](evidence/realtime/logs/2026-10-21T00-22-40.167+06-00-npm.log) | exit0: **6 Playwright** | Desktop/mobile: live API+PG, error state, принудительный WS close1012 → повторный REST и новый socket |
| [npm run compose:up](evidence/realtime/logs/2026-10-21T00-18-47.447+06-00-npm.log), [ps](evidence/realtime/logs/2026-10-21T00-22-40.438+06-00-docker.log) | exit0; postgres/api/worker/web healthy, migrate/seed exit0 | Upgrade существующего volume до schema4; сборка/запуск по README |
| [npm run demo:realtime](evidence/realtime/logs/2026-10-21T00-22-25.025+06-00-npm.log) | exit0 | Три live WS-клиента через frontend proxy, изоляция, server GPS/battery при disconnected owner; REST restore перед reconnect; pause/resume/finish/replay; одно письмо/notice |
| [npm run mail:show](evidence/realtime/logs/2026-10-21T00-27-23.740+06-00-npm.log), [БД](evidence/realtime/live-database.json) | exit0 / read-only assertions | Сумма1000 тыйын, closed intervals совпадают с invoice, один finish notice/outbox/ack/mail, реальный plaintext счёта |
| [npm run db:generate](evidence/realtime/logs/2026-10-21T00-22-40.284+06-00-npm.log) | exit0, No schema changes | Snapshot/schema согласованы после 0003; предыдущие миграции не переписывались |
| [npm audit](evidence/realtime/logs/2026-10-21T00-24-05.090+06-00-npm.log) | exit0, 0 vulnerabilities | Текущее установленное dependency tree, не обещание будущей безопасности |
| [Финальный typecheck](evidence/realtime/logs/2026-10-21T00-27-23.745+06-00-npm.log) | exit0 | Включая поздно добавленный paused-depletion case и helpers |

Новые PG tests проверяют три клиента через два независимых API/pool; ticket TTL/single-use/hash, Origin, read-only sockets; notification privacy; движение/разряд/паузу; delayed tick и **оба riding/paused** depletion вне зоны в гонке двух worker/manual finish; rollback mail acceptance→ack и параллельный retry; fractional charge между арендами и реальное чуть ниже15%; одно warning/expiry при offline клиенте; реальные stop/start API и worker.

Process test использует ускоренные validated параметры собственной изолированной БД: API останавливается при работающем worker, затем worker останавливается через расчётный deadline, новый worker догоняет и фиксирует endedAt=start+6000ms. После нового API найден один invoice800/notice/mail. Отдельные delayed tests дают 800 в riding и 200 в paused, без платы за опоздание. В основной config по-прежнему tick3000ms, бронь900s, warning180s; полного естественного разряда и полного 15-минутного wall-clock ожидания в этом этапе не было.

Живая demo-поездка SK-003: public batteryBp1500→1494 на первом наблюдении, GPS изменился; после всей поездки сохранено1489 с дробным остатком49580/60000, distance21204mm, active7068ms + paused139ms, округлённые1+1мин=1000тыйын. Неоплаченный demo invoice оставлен как реальная история. Это не нагрузочный benchmark. [Desktop](evidence/realtime/desktop.png) и [mobile](evidence/realtime/mobile.png) просмотрены: статус и список технических данных помещаются, overflow не обнаружен.

## Неудачные запуски и исправления

Сырые неудачные результаты сохранены рядом с успешными, не удалены:

- 00:04 db:generate: `TypeError: Do not know how to serialize a BigInt`, CLI ошибочно exit0. `.default(0n)` заменён SQL default0, миграция сгенерирована заново **до применения**; успех подтверждён наличием SQL, fresh/repeat tests и No schema changes.
- 00:05 test:db: 3 failed suites /35 skipped, ECONNREFUSED; 00:06 два infra:up exit1 — Docker Engine отсутствовал. Повторился dockerInference stale runtime socket. Проверены абсолютные пути/границы/reparse; Docker/run обратимо переименован в run.stale-20261021-001314, аварийные процессы остановлены, Desktop перезапущен Hidden. Volumes/settings не удалялись. После infra:up PostgreSQL healthy. Подробности известного сбоя — [DOCKER-TROUBLESHOOTING.md](DOCKER-TROUBLESHOOTING.md).
- 00:15 test:db: 2 failed /39 passed. LISTEN использовал env main database, а pool теста — isolated database; из-за этого не приходил commit hint. Исправлено использование реального database.connectionString для обоих. Target realtime suite прошёл; полный финальный suite43passed.
- 00:18 test:db ошибочно запущен одновременно с тяжёлым Compose build: 1 failed /35 passed /6 skipped, 2 failed files. PostgreSQL прервал connections и вошёл в recovery. В логе 00:20:07 child PID1209 exit2, затем завершение других процессов, reinitialization и ready00:20:28. OOMKilled=false, container restartcount0; точная первопричина **не установлена**. Не объявляем это исправленным багом приложения/OOM. После завершения build/healthy последовательный full suite42passed, после добавления paused-depletion —43passed. На этой машине тяжёлый build и PG fault/process tests впредь выполняются последовательно.
- 00:34 read-only helper ошибочно ожидал reason=manual, тогда как действующий enum finished_by_user. Исправлена только проверка; повтор прошёл, оба лога сохранены. Продуктовая БД этой проверкой не изменялась.

В полных PostgreSQL logs есть также **ожидаемые** negative-test ошибки ограничений и injected `test mail ack crash`; они подтверждают rollback-проверки и не скрываются под успехом команды чтения logs. Все конкретные filenames/exit/timestamps находятся в COMMANDS.json.

## Оставшиеся ограничения и предложение коммита

Внешняя SMTP-почта и KY тексты, полная password/Google авторизация, sessions/logout, карта/интерфейс аренды, pagination, UI уведомлений остаются открыты. Public техническая страница не показывает чужие private данные; приватный SDK проверен интеграционно, продуктовый private UI ещё не создан. Модель маршрута не учитывает дороги, свободные scooters не перемещаются и не заряжаются сами. WS объединяет изменения в актуальный snapshot, не хранит журнал каждого промежуточного event. Высокая нагрузка и гарантированный <=2s lag не проверялись. Downtime reconciliation проверен; planned длительный PostgreSQL fault/load run и полная приёмка исходного ТЗ впереди.

Предложение отдельного коммита: `feat: add persistent simulation, realtime sync and local invoice mail`. Коммит и push потребуют отдельной команды пользователя; история и Git-авторство не менялись. Следующий этап автоматически не начинается.
