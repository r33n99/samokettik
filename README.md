# СамоКеттик

Веб-приложение шеринга электросамокатов для Бишкека. Реализованы серверное бронирование, поездки start/pause/resume/finish, отдельные тарифы движения и паузы, polygon geofence, счета и локальная демонстрационная оплата. Добавлены постоянный GPS/charge-симулятор, автостоп при разряде, WebSocket и локальный почтовый ящик. Frontend: адаптивная Leaflet-карта с геозоной, бронирование/поездка, история/счета, RU/KY, два демонстрационных пользователя. Password/Google-авторизация и внешняя SMTP-почта ещё не реализованы.

## Требования

- Docker Desktop с работающим **Linux Engine** и Docker Compose v2.
- Node.js 24 LTS либо Node.js 22 версии не ниже 22.12; npm >=10. Контейнерная сборка использует Node 24.
- Свободные локальные порты: 5173 (frontend), 3001 (API), 54329 (PostgreSQL).

Команды ниже выполняются из корня репозитория. В Windows PowerShell, если выполнение `npm.ps1` заблокировано политикой, используйте `npm.cmd` вместо `npm`; менять ExecutionPolicy не нужно.

## Полный запуск через Docker Compose

```sh
npm ci
npm run setup
npm run compose:up
```

`setup` создаёт `.env` со случайным локальным паролем и двумя разными секретными demo-токенами. В существующий файл добавляются только отсутствующие настройки; существующие значения сохраняются. Генератор включает локальный `DEMO_AUTH_ENABLED=true`; в `.env.example` и runtime default режим выключен. `.env` исключён из Git. Не публикуйте его содержимое.

Compose последовательно запускает PostgreSQL, применяет миграции сервисом `migrate`, выполняет demo seed сервисом `seed`, запускает worker, затем API и frontend. Ожидается успешное завершение migrate/seed и healthy у остальных сервисов. Frontend обращается к отдельному API через nginx proxy; это не mock и не localStorage.

- Приложение: [http://localhost:5173](http://localhost:5173).
- Backend liveness: [http://localhost:3001/health/live](http://localhost:3001/health/live).
- Backend readiness: [http://localhost:3001/health/ready](http://localhost:3001/health/ready).
- Данные технического стенда: [http://localhost:3001/api/v1/system](http://localhost:3001/api/v1/system).

Открывается карта Бишкека; кнопка «Самокаты · 30» и маркеры читаются из PostgreSQL через API. Нажмите «Выбрать демо-профиль», затем Айжан или Бек. После входа восстанавливается текущая аренда и доступна карточка транспорта. `/health/live` проверяет процесс, `/health/ready` — БД, версию схемы 6 и свежие успешные heartbeats reservation и transport-background worker с тем же hash конфигурации. При отсутствии БД, миграции или worker readiness возвращает HTTP 503.

```sh
docker compose ps -a
docker compose logs --tail 50 migrate seed api
npm run compose:down
```

`compose:down` сохраняет именованный volume. Не добавляйте `-v`, если нужны данные. Смена пароля в `.env` не меняет пароль уже инициализированного PostgreSQL-volume; не удаляйте данные для исправления опечатки, восстановите исходный локальный env.

## Разработка с hot reload

Если полный Compose уже запущен, сначала остановите его, чтобы освободить API/web порты:

```sh
npm run compose:down
npm ci
npm run setup
npm run infra:up
npm run db:migrate
npm run db:seed
npm run db:check
npm run dev
```

`dev` собирает contracts и запускает Vite, Fastify и worker в трёх процессах. Ctrl+C останавливает дочерние процессы; PostgreSQL продолжает работать в Docker. Для запуска отдельно: `npm run dev:api`, `npm run dev:worker`, `npm run dev:web` (после `npm run build -w @samokettik/contracts`). После изменения contracts их нужно пересобрать. Vite proxy направляет `/api` (включая WebSocket upgrade) и `/health` на backend.

## База данных и демонстрационные данные

Схема: `app_metadata`, `users`, `vehicles`, `rentals`, `trip_intervals`, `invoices`, `demo_payments`, `notifications`, `idempotency_requests`, `job_heartbeats`, `trip_simulations`, `mail_outbox`, `local_mailbox`, `realtime_tickets`. Всего 14 таблиц. Координаты — целые e7, заряд — basis points (10000 = 100%) с сохраняемым дробным остатком расхода /60000. У брони сохранены серверные reserved_at/warn_at/expires_at, статус и причина завершения. Частичные UNIQUE запрещают две активные строки reserved/riding/paused на самокат или пользователя; CHECK/FK защищают состояния, суммы и владельцев. Интервалы не пересекаются (btree_gist EXCLUDE), на rental только один invoice и на invoice одна demo payment. Миграция 0003 добавляет симуляцию, почту, tickets и PostgreSQL NOTIFY triggers; применённые 0000–0002 не изменялись.

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:check
```

- `db:generate`: создаёт SQL и snapshot из Drizzle schema; просмотрите SQL перед применением. Для существующей схемы новый файл не создаётся.
- `db:migrate`: применяет сохранённые миграции; повторный запуск безопасен. Выполнять одним процессом, как в Compose.
- `db:seed`: разрешён только при `DEMO_SEED_ENABLED=true`, атомарно добавляет 30 самокатов и двух пользователей. Повтор не перезаписывает существующие строки. Не запускайте в production.
- Демо-пользователи: `demo.ru@example.test`, `demo.ky@example.test`. Паролей/Google-входа пока нет. Для серверной демонстрации используются два разных секретных Bearer-токена из `.env`, а не переданный клиентом userId.
- Среди самокатов есть 0%, 14,99%, 15%, maintenance и более высокие заряды. Стартовые точки — 30 уникальных seedLocations по всей геозоне, включая отдельные участки MultiPolygon, движение по сохранённому замкнутому маршруту начинается в поездке, на паузе координаты неподвижны. Граница демонстрации — полный OSM MultiPolygon relation 8493930 из config/service-zone.json; источник/версия/лицензия сохранены. Это snapshot OSM, не юридическая граница.

Основные бизнес-настройки находятся в `config/demo.json`: RU/KY, Asia/Bishkek, KGS, 800/200 тыйын в минуту, 900/180 секунд брони/предупреждения, 1500 bp и simulation tick 3000 ms. Бронь/предупреждение/порог заряда и тарифы используются сервером. Политика ceil-per-mode-v1 округляет суммарное время движения и пауз вверх отдельно; подробности в [BILLING.md](docs/BILLING.md). Симуляция использует 180 м/мин, расход 100 bp/мин в движении и 20 bp/мин на паузе. Параметры сохраняются на start, дробный расход переносится между поездками. Дедлайны созданной брони сохраняются в БД и не пересчитываются при смене config/restart.

`.env.example` описывает соединение и порты. Для host tools `DATABASE_URL` указывает на `127.0.0.1:54329`; Compose задаёт внутренний адрес `postgres:5432`. Если меняете `POSTGRES_PORT`, синхронно измените URL. Если меняете локальный `API_PORT`, измените `VITE_PROXY_TARGET`. В Compose API внутри остаётся на 3001, снаружи публикуется выбранный порт. Все ports привязаны к loopback.

## Проверки

```sh
npm run typecheck
npm test
npm run build
npm run test:db
npm exec -- playwright install chromium
npm run test:e2e
npm audit
```

E2E требует работающий PostgreSQL (`npm run infra:up`), сам запускает отдельные настоящие API/worker/Vite и изолированную UUID-базу. Основная demo DB не меняется. Web test port по умолчанию 5180, при необходимости задайте E2E_WEB_PORT. Desktop/mobile тесты используют реальные API/PG; отдельно моделируются startup503, недоступные tiles и потеря ответа после настоящего commit. Подробности — docs/FRONTEND.md.

`test:db` создаёт собственную базу `samokettik_test_<uuid>` и удаляет **только её** после теста. Нужны права CREATEDB (у локального Compose-пользователя они есть). Основная демо-база не очищается. Проверяются миграции/seed при повторе, сохранение изменённой строки, ограничения БД, реальный fleet count и readiness при недоступной/неподготовленной БД.

Локальный пользователь PostgreSQL в стандартном образе имеет расширенные права для миграций и изолированных тестов. Это окружение разработки, не production-конфигурация ролей. Production role separation не входит в текущий этап.

Для записи реальной команды и результата в WORKLOG:

```sh
node scripts/check.mjs npm run typecheck
node scripts/check.mjs docker compose config --quiet
```

Не передавайте секреты аргументами журналируемой команды. Полные логи сохраняются в игнорируемом `work/checks/`, фактическое время начала/конца и exit code — в `docs/WORKLOG.md`.

## Проблемы окружения

- Отсутствует `dockerDesktopLinuxEngine`: запустите Docker Desktop и дождитесь работающего Engine; наличие Docker CLI недостаточно.
- Ошибка `dockerInference: The file cannot be accessed by the system`: описание фактически выполненной диагностики и обратимого восстановления — [DOCKER-TROUBLESHOOTING.md](docs/DOCKER-TROUBLESHOOTING.md). Не используйте factory reset как первый шаг.
- `DATABASE_NOT_READY`: проверьте PostgreSQL, пароль/порт и `db:migrate`; в Compose просмотрите exit status migrate/seed.
- Занят порт: завершите другой запуск проекта или измените соответствующие env. Vite использует strictPort и не переходит молча на другой порт.
- В seed disabled режиме full demo Compose не завершит успешный старт: для этого демо seed обязателен. Production startup будет проектироваться отдельно.

## Документы и граница этапа

[Архитектура](docs/ARCHITECTURE.md), [решения](docs/DECISIONS.md), [требования](docs/REQUIREMENTS.md), [журнал](docs/WORKLOG.md), [промпты](docs/PROMPTS.md), [план этапов](docs/IMPLEMENTATION-PLAN.md). Фактическая реализация и ограничения описаны в [отчёте этапа](docs/FOUNDATION-REPORT.md).

Рабочий UI реализован по выбранному пользователем варианту «Карта»; исследование и три исходных варианта — docs/design-research/frontend/README.md. Google и внешний почтовый транспорт остаются задачами будущих этапов; локальная почта реализована; текущие billing/зона описаны в [BILLING.md](docs/BILLING.md). Проект опубликован в приватном [r33n99/samokettik](https://github.com/r33n99/samokettik); первый commit 4d6bdcd. Результаты серверного бронирования — [RESERVATIONS-REPORT.md](docs/RESERVATIONS-REPORT.md). Следующий этап начинается только по отдельной команде.

## Серверное бронирование

```sh
npm run demo:reservations
```

Скрипт читает локальные токены без вывода, выбирает свободный самокат и одновременно отправляет запросы двух пользователей. Ожидаются 201/409 и точное совпадение replay-ответа по тому же ключу; в конце успешная бронь отменяется. У demo users не должно быть другой активной брони. Скрипт не меняет время/дедлайны. Интеграционный тест дополнительно удерживает DB-lock и проверяет, что оба запроса действительно одновременно ждут PostgreSQL.

| Маршрут | Доступ / назначение |
| --- | --- |
| GET `/api/v1/vehicles` | Публичный список available/reserved/in_ride/unavailable; без чужих владельцев/ID брони |
| POST `/api/v1/reservations` | Bearer + `Idempotency-Key: <UUID>`, JSON `{ "vehicleId": "<UUID>" }` |
| POST `/api/v1/reservations/:id/cancel` | Bearer + новый Idempotency-Key; пустое тело или `{}`; только собственная бронь |
| GET `/api/v1/rentals/current` | Bearer; собственная бронь или trip, null при отсутствии; serverTime |
| GET `/api/v1/notifications` | Bearer; последние 100 собственных сохранённых уведомлений |

Токены: `DEMO_USER_RU_TOKEN` / `DEMO_USER_KY_TOKEN`. Это временный локальный adapter, не production authentication. Без `DEMO_AUTH_ENABLED=true` защищённые маршруты возвращают AUTH_NOT_CONFIGURED; неверный токен — 401. Не используйте здесь пароль пользователя.

Сервер проверяет доступность, заряд >=15% и одну активную аренду на пользователя. Переходы: reserved → cancelled/expired либо riding; затем riding ↔ paused → finished. Поездка не истекает по старому дедлайну брони. Клиентские статусы, сроки, userId и другие лишние поля отклоняются. Время берётся из PostgreSQL после ожидания блокировок. На дедлайне бронь недействительна; отмена после дедлайна возвращает 409 и фиксирует истечение.

Сохраняйте Idempotency-Key при сетевом retry. Тот же key/body/operation возвращает первоначальные status/body, включая сохранённый отказ; другое тело/операция с тем же key даёт IDEMPOTENCY_CONFLICT. Новое пользовательское действие требует нового ключа. Replay create после отмены/истечения вернёт исходный ответ и не создаст новую бронь; актуальное состояние читайте через rentals/current. Повтор cancel с новым key для уже отменённой собственной брони безопасен. Ключ другого пользователя не конфликтует с вашим.

Worker проверяет БД по `BOOKING_JOB_POLL_MS` (1000 ms), до `BOOKING_JOB_BATCH_SIZE` (50) кандидатов за цикл. Warning создаётся при warn_at <= DB time < expires_at, одной записью на логическое событие. Если worker отсутствовал всё окно warning, после старта создаётся expiry, а не устаревшее предупреждение. Уведомления сохраняются без браузера и доставляются владельцу private WebSocket snapshots; toast в интерфейсе аренды пока отсутствует.

При остановке worker дедлайны остаются в БД и восстанавливаются; readiness проверяет обе фоновые задачи и становится 503 после `BOOKING_WORKER_STALE_MS` (10000 ms). Heartbeat агрегирован по задаче, не является индивидуальным монитором каждого worker. Истёкшая бронь не блокирует новую до запуска worker: API выполняет cleanup отдельной корректно заблокированной транзакцией и повторяет запрос. Два worker защищены row-lock и UNIQUE уведомлений. При падении заряда/maintenance бронь отменяется с причиной. Показ предупреждения отключённому браузеру не гарантируется: запись читается после подключения.

## Серверные поездки и оплата

```sh
npm run demo:trips
```

При запущенном Compose и свободном demo.ru скрипт проходит через frontend proxy → API → PostgreSQL: бронь, старт, пауза, возобновление, завершение, отказ оплаты, успешная оплата и replay. Ожидается 1000 тыйын (8 сом за начатую активную минуту + 2 сом за начатую минуту паузы). Скрипт использует реальные короткие задержки; историю своей завершённой поездки/оплаты не удаляет, чужие аренды не отменяет. Секреты читает только из .env без вывода.

Контракты, правило округления, примеры цен, snapshot зоны и ограничения: [BILLING.md](docs/BILLING.md). Фактические проверки этапа: [TRIPS-REPORT.md](docs/TRIPS-REPORT.md). Деньги и длительности в JSON передаются строками; суммы в тыйынах. Для write-команд нужны Bearer и Idempotency-Key; время, координаты и стоимость клиент не задаёт.

## Симуляция, WebSocket и локальные письма

`npm run compose:up` обновляет существующий volume до схемы 6; миграции и seed повторяемы. Worker работает отдельно от API/вкладки. Номинальный simulation tick — 3 секунды; при poll 1 секунда обработка может опоздать на один poll. Изменения считаются по реальному прошедшему DB-времени, а не числу ticks. После простоя worker догоняет состояние, ограничивая поездку точной расчётной ms разряда; автостоп разрешён и вне зоны. Ручное завершение вне зоны по-прежнему запрещено.

При подключении/переподключении SDK сначала читает REST, затем открывает WS и принимает свежий полный snapshot. Публичный канал содержит только fleet; private — данные своего пользователя. Нужные настройки в .env.example: WS_ALLOWED_ORIGINS (при изменении WEB_PORT обновите список), WS_RECONCILE_MS, WS_HEARTBEAT_MS, WS_TICKET_SECONDS, WS_MAX_CLIENTS, WS_MAX_BUFFERED_BYTES. Обычный bearer передаётся только HTTP; private WS использует одноразовый ticket в subprotocol, без токена в URL.

| Маршрут | Назначение |
| --- | --- |
| GET /api/v1/sync | Bearer: согласованный snapshot fleet/current/notifications/invoices/mailbox |
| POST /api/v1/realtime/tickets | Bearer, {}: одноразовый ticket на 30 секунд |
| WS /api/v1/realtime | Origin из allowlist, subprotocol samokettik.v1; дополнительно ticket.<ticket> для private |
| GET /api/v1/mailbox | Bearer: последние 100 собственных локальных писем |

`mail_outbox` создаётся атомарно со счётом и уведомлением. Worker доставляет письмо в `local_mailbox` и подтверждает outbox одной PostgreSQL-транзакцией. UNIQUE invoice_id исключает повтор одного логического письма. Это локальная эмуляция без SMTP и отправки во внешнюю почту; отдельный Mailpit не требуется. Текст содержит счёт, сумму и причину ручного/автоматического завершения; пока только RU.

Для демонстрации два demo-пользователя должны быть без активной аренды:

```sh
npm run demo:realtime
npm run mail:show
```

Первый скрипт проверяет три WS-клиента через frontend proxy, движение/разряд, потерю WS владельца и восстановление через API, pause/resume/finish/replay и одно письмо/уведомление. Он создаёт реальную завершённую demo-поездку с неоплаченным счётом; заглушку оплаты можно вызвать отдельно. Полный разряд, простои и гонки проверяются ускоренными параметрами только в изолированных PostgreSQL tests. Не меняйте production/demo drain ради теста.

Подробности: [SIMULATION-REALTIME.md](docs/SIMULATION-REALTIME.md), фактические результаты и ограничения — [REALTIME-REPORT.md](docs/REALTIME-REPORT.md). Следующий этап, commit и push автоматически не выполняются.

## Работа с frontend

1. Выполните npm run setup и npm run compose:up, откройте http://localhost:5173/. Setup добавляет отсутствующие настройки DEMO_BROWSER_ENABLED/DEMO_SESSION_SECRET/DEMO_SESSION_SECONDS/MAP_TILE_URL, прежние значения сохраняет. В runtime и .env.example browser demo по умолчанию выключен, локальный setup включает его явно.
2. Выберите профиль Айжан, найдите свободный самокат на карте или через «Самокаты · 30», забронируйте. Бронь/её дедлайн создаёт сервер; таймер не отменяет её локально. Заряд ниже порога/maintenance/чужая аренда блокируют действие.
3. Во втором окне выберите Бек и тот же самокат. После обновления он занят; одновременный POST также атомарно отклоняется сервером. Профили общие для демо, а временный credential хранится отдельно в sessionStorage вкладки. Не используйте этот адаптер для реальных аккаунтов.
4. Начните поездку, поставьте на паузу, продолжите и завершите с подтверждением. Показанная стоимость приходит с сервера; правило округления объяснено в карточке. Ручной finish вне зоны отклоняется сервером, при разряде выполняется автостоп.
5. В «Поездки» и «Счета» доступны последние100 собственных записей. В деталях счёта есть demo оплата и проверка отказа; реальных денег нет. Уведомления доступны в шапке, новые finish/expiry отображаются отдельно. RU/KY переключается кнопкой языка; время — Asia/Bishkek.
6. При offline/reconnect команды отключены, поездка продолжает работать на сервере. После восстановления SDK сначала читает REST. Потерянный ответ команды требует «Повторить с тем же ключом»; такое намерение сохраняется при reload, новая команда до разрешения предыдущей блокируется.

Для другого порта frontend измените WEB_PORT и WS_ALLOWED_ORIGINS. MAP_TILE_URL — публичный HTTPS template, не место для приватного ключа. OSM attribution сохраняется; при сбое подложки карта данных и доступный список остаются рабочими. Подробности: [FRONTEND.md](docs/FRONTEND.md), результаты этапа: [FRONTEND-REPORT.md](docs/FRONTEND-REPORT.md). Полный password/Google login, cursor pagination, KY письма и нагрузочная/длительная приёмка остаются открытыми.

## Распределение самокатов

Новые seedLocations распределены по всей зоне Бишкека. Для существующей demo DB выполните `npm run demo:redistribute`: команда переместит только транспорт без действующей брони/поездки, сохранив заряд и историю. Seed по-прежнему не перезаписывает данные. Подробности и проверка координат: [DEMO-FLEET.md](docs/DEMO-FLEET.md). После изменения config выполните `npm run compose:up` для API/worker с одинаковой конфигурацией.

## Приёмка кейса №11

`npm run test:acceptance` — отдельный реальный15-минутный прогон в UUID PostgreSQL DB со своим API/worker. Предупреждение ожидается через12минут, истечение через15; после предупреждения worker перезапускается. Deadline и часы не ускоряются. Main demo DB не изменяется. Быстрые `npm test`, `npm run test:db` и `npm run test:e2e` запускаются отдельно. Итоговая матрица и ограничения — [CASE11-AUDIT.md](docs/CASE11-AUDIT.md).

Миграция0004 добавляет auth_expires_at для private WS и metadata5. При `npm run compose:up` инвалидируются только старые одноразовые WS tickets; активные аренды, пользователи, счета и volume сохраняются. Временный browser token ограничивает также срок открытого private WS; после его истечения клиент снова проходит REST authentication. Изолированный Playwright использует60s browser sessions для фактического теста expiry; локальный demo TTL3600 не изменён.


## Пагинация историй и карта

Истории поездок/счетов доступны полностью через GET /api/v1/trips и GET /api/v1/invoices: ответ items/nextCursor, параметры cursor (UUID) и limit (1–100, по умолчанию20). В UI — Next/Back по20 записей; оплата старого счёта работает на его странице. WS invoices остаётся ограниченным snapshot для сверки, не источником полной истории.

Клик маркера выбирает карточку без переноса карты. Кнопка «Показать свой самокат» явно показывает активную бронь/поездку; выбор из списка показывает выбранный транспорт. Leaflet prefix удалён, обязательная OSM attribution компактно расположена внизу. Проверки и ограничения: [HISTORY-MAP-REPORT.md](docs/HISTORY-MAP-REPORT.md).
