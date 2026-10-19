# СамоКеттик

Веб-приложение шеринга электросамокатов для Бишкека. Реализованы каркас и **серверное бронирование**: список транспорта, атомарная бронь/отмена, истечение и предупреждения независимым worker. Поездки, полноценная авторизация, оплата, почта, карта и WebSocket ещё не реализованы. Frontend остаётся страницей проверки подключения, без UI брони.

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

Страница должна показать «API и PostgreSQL доступны» и «30 самокатов». Количество считывается из PostgreSQL через Drizzle. `/health/live` проверяет процесс, `/health/ready` — БД, версию схемы 2 и свежий успешный heartbeat worker с тем же hash конфигурации. При отсутствии БД, миграции или worker readiness возвращает HTTP 503.

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

`dev` собирает contracts и запускает Vite, Fastify и worker в трёх процессах. Ctrl+C останавливает дочерние процессы; PostgreSQL продолжает работать в Docker. Для запуска отдельно: `npm run dev:api`, `npm run dev:worker`, `npm run dev:web` (после `npm run build -w @samokettik/contracts`). После изменения contracts их нужно пересобрать. Vite proxy направляет `/api` и `/health` на backend.

## База данных и демонстрационные данные

Схема: `app_metadata`, `users`, `vehicles`, `rentals`, `notifications`, `idempotency_requests`, `job_heartbeats`. Координаты — целые e7, заряд — basis points (10000 = 100%). У брони сохранены серверные reserved_at/warn_at/expires_at, статус и причина завершения. Частичные UNIQUE запрещают две reserved-строки на самокат или пользователя; CHECK/FK защищают данные и владельца уведомления. Поездки и счета добавятся позже.

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
- Среди самокатов есть 0%, 14,99%, 15%, maintenance и более высокие заряды. Стартовые точки — искусственная сетка в центральной части Бишкека, без симуляции движения. Согласованной границы обслуживания пока нет; seed не объявляется проверкой всей зоны города.

Основные бизнес-настройки находятся в `config/demo.json`: RU/KY, Asia/Bishkek, KGS, 800/200 тыйын в минуту, 900/180 секунд брони/предупреждения, 1500 bp и simulation tick 3000 ms. Бронь/предупреждение/порог заряда используются сервером; тарифы и симуляция пока только валидируются. Дедлайны созданной брони сохраняются в БД и не пересчитываются при смене config/restart.

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

Перед E2E приложение должно быть запущено через Compose или `dev`. По умолчанию Playwright проверяет `http://127.0.0.1:5173`; можно задать `E2E_BASE_URL`. В тестах используются настоящий API и PostgreSQL, desktop и mobile. Отдельный тест ошибки интерфейса подменяет readiness-ответ, что явно отмечено в исходнике; успешный сценарий не подменяется.

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

Текущая страница — техническая проверка подключения, не финальный дизайн продукта. Google, точная зона, почтовый режим и billing остаются решениями будущих этапов. Git-репозиторий создан локально; remote/push/commit не выполнялись. Результаты серверного бронирования — [RESERVATIONS-REPORT.md](docs/RESERVATIONS-REPORT.md). Следующий этап начинается только по отдельной команде.

## Серверное бронирование

```sh
npm run demo:reservations
```

Скрипт читает локальные токены без вывода, выбирает свободный самокат и одновременно отправляет запросы двух пользователей. Ожидаются 201/409 и точное совпадение replay-ответа по тому же ключу; в конце успешная бронь отменяется. У demo users не должно быть другой активной брони. Скрипт не меняет время/дедлайны. Интеграционный тест дополнительно удерживает DB-lock и проверяет, что оба запроса действительно одновременно ждут PostgreSQL.

| Маршрут | Доступ / назначение |
| --- | --- |
| GET `/api/v1/vehicles` | Публичный список available/reserved/unavailable; без чужих владельцев/ID брони |
| POST `/api/v1/reservations` | Bearer + `Idempotency-Key: <UUID>`, JSON `{ "vehicleId": "<UUID>" }` |
| POST `/api/v1/reservations/:id/cancel` | Bearer + новый Idempotency-Key; пустое тело или `{}`; только собственная бронь |
| GET `/api/v1/rentals/current` | Bearer; собственная действующая бронь или null, serverTime |
| GET `/api/v1/notifications` | Bearer; последние 100 собственных сохранённых уведомлений |

Токены: `DEMO_USER_RU_TOKEN` / `DEMO_USER_KY_TOKEN`. Это временный локальный adapter, не production authentication. Без `DEMO_AUTH_ENABLED=true` защищённые маршруты возвращают AUTH_NOT_CONFIGURED; неверный токен — 401. Не используйте здесь пароль пользователя.

Сервер проверяет доступность, заряд >=15% и одну активную бронь на пользователя. Переходы пока только reserved → cancelled/expired, поездку начать нельзя. Клиентские статусы, сроки, userId и другие лишние поля отклоняются. Время берётся из PostgreSQL после ожидания блокировок. На дедлайне бронь недействительна; отмена после дедлайна возвращает 409 и фиксирует истечение.

Сохраняйте Idempotency-Key при сетевом retry. Тот же key/body/operation возвращает первоначальные status/body, включая сохранённый отказ; другое тело/операция с тем же key даёт IDEMPOTENCY_CONFLICT. Новое пользовательское действие требует нового ключа. Replay create после отмены/истечения вернёт исходный ответ и не создаст новую бронь; актуальное состояние читайте через rentals/current. Повтор cancel с новым key для уже отменённой собственной брони безопасен. Ключ другого пользователя не конфликтует с вашим.

Worker проверяет БД по `BOOKING_JOB_POLL_MS` (1000 ms), до `BOOKING_JOB_BATCH_SIZE` (50) кандидатов за цикл. Warning создаётся при warn_at <= DB time < expires_at, одной записью на логическое событие. Если worker отсутствовал всё окно warning, после старта создаётся expiry, а не устаревшее предупреждение. Уведомления сохраняются без браузера; websocket/toast/email доставки в этом этапе нет.

При остановке worker дедлайны остаются в БД и восстанавливаются; readiness становится 503 после `BOOKING_WORKER_STALE_MS` (10000 ms). Heartbeat агрегирован по задаче, не является индивидуальным монитором каждого worker. Истёкшая бронь не блокирует новую до запуска worker: API выполняет cleanup отдельной корректно заблокированной транзакцией и повторяет запрос. Два worker защищены row-lock и UNIQUE уведомлений. При падении заряда/maintenance бронь отменяется с причиной. Показ предупреждения отключённому браузеру не гарантируется: запись читается после подключения.
