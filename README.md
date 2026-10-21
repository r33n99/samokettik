# СамоКеттик

Демонстрационное веб-приложение шеринга электросамокатов в Бишкеке: React-карта, отдельный Fastify API, PostgreSQL, серверный worker и WebSocket. RU/KY, Asia/Bishkek, KGS. Проект подготовлен как техническое задание с участием AI coding agent под контролем пользователя.

**Уточнённый объём приёмки U023:** email/password, Google OAuth, кыргызская локализация и внешний SMTP не обязательны. Для конкурентных сценариев используются два общих demo-профиля; письма доставляются в локальный PostgreSQL mailbox. Обязательны ровно одно письмо со счётом на завершение, причина полного разряда при автостопе и уведомление за3минуты до expiry (не обязательно email). [Актуальная проверка почты](docs/MAIL-REVIEW.md), [матрица](docs/SUBMISSION-MATRIX.md), [историческая подготовка к сдаче](docs/SUBMISSION.md).

## Зависимости

- Docker Desktop с работающим Linux Engine и Docker Compose v2.
- Node.js 24 либо 22.12+ в ветке22; npm10+. Точные engines — package.json; контейнер использует закреплённый Node24 image.
- Git для clone; доступ к private репозиторию. Альтернатива — исходники без `.env`, `node_modules`, `dist` и приватных данных.
- Для стандартного запуска свободны 5173 (web), 3001 (API), 54329 (PostgreSQL). Для E2E отдельно нужен5180.
- Интернет для npm registry/Docker Hub/установки Chromium; OSM tiles требуют сеть. При сбое тайлов маркеры, список и серверные операции остаются доступны. Шрифты поставляются локально.

Команды выполнять из корня. В Windows PowerShell при блокировке npm.ps1 используйте `npm.cmd`; менять ExecutionPolicy не требуется. Linux CI может потребовать `npm exec -- playwright install --with-deps chromium` для системных библиотек браузера.

## Установка и полный запуск

```sh
git clone https://github.com/r33n99/samokettik.git
cd samokettik
npm ci
npm run setup
npm run compose:up
```

`setup` создаёт локальный `.env` со случайными паролем, двумя CLI bearer и browser-session secret, включает demo-режим. Повтор сохраняет существующие значения. `.env.example` содержит только заглушки; demo-auth по умолчанию выключена. Секреты не передавать аргументами команд и не публиковать.

Compose: PostgreSQL → migrate → demo seed → worker → API → nginx/frontend. Миграции/seed должны завершиться с exit0, остальные сервисы — healthy. Создаются14 таблиц, schema/readiness6, два пользователя и30 самокатов. Самокаты распределены по четырём компонентам демонстрационной OSM-геозоны.

- [Приложение](http://localhost:5173/).
- [API liveness](http://localhost:3001/health/live).
- [API readiness](http://localhost:3001/health/ready): БД, версия схемы, свежие heartbeats worker и совпадение business config hash.
- [System info](http://localhost:3001/api/v1/system).

```sh
docker compose ps -a
docker compose logs --tail 50 migrate seed api worker
npm run compose:down
```

Остановка сохраняет volume. **Не добавляйте `-v`, если нужны данные.** Новое значение POSTGRES_PASSWORD не изменяет пароль в уже инициализированном volume; восстановите исходный локальный env. Для независимого стенда используйте отдельные COMPOSE_PROJECT_NAME и порты — [сценарий проверки](docs/DEMO.md).

## Локальная разработка

Сначала освободите web/API порты, остановив полный Compose. После `npm ci` общий пакет contracts ещё не собран — этот шаг нужен перед host seed/check/test-командами:

```sh
npm run compose:down
npm ci
npm run setup
npm run build -w @samokettik/contracts
npm run infra:up
npm run db:migrate
npm run db:seed
npm run db:check
npm run dev
```

`dev` собирает contracts и запускает Vite, API и worker; Ctrl+C останавливает дочерние процессы. После изменения contracts пересоберите пакет. Отдельные команды: `dev:api`, `dev:worker`, `dev:web`. Vite/nginx проксируют `/api`, WebSocket upgrade и `/health` к отдельному backend.

## Миграции, seed и конфигурация

- `npm run db:generate` — Drizzle Kit генерирует SQL/snapshot; просмотрите SQL. Не использовать `drizzle-kit push` и не изменять применённые миграции.
- `npm run db:migrate` — последовательное применение сохранённых0000–0005; повтор безопасен. Запускать одним процессом, как в Compose.
- `npm run db:seed` — при DEMO_SEED_ENABLED=true добавляет отсутствующих demo users/vehicles атомарно, существующие строки сохраняет.
- `npm run db:check` — проверяет подключение, schema metadata и количество объектов.
- `npm run demo:redistribute` — явно перемещает только самокаты без активной аренды, сохраняя историю/заряд. Seed сам ничего не переносит.

Бизнес-настройки — `config/demo.json`, граница — `config/service-zone.json`:800/200 тыйын за минуту движения/паузы, бронь900s, warning за180s, min charge1500bp (15%), simulation tick3000ms, fleet30. В demo есть0%,14,99%,15% и maintenance. Технические настройки — валидируемые `.env` и `.env.example`; config hash API/worker должен совпадать.

При изменении портов согласованно обновите POSTGRES_PORT/DATABASE_URL, API_PORT/VITE_PROXY_TARGET и WEB_PORT/WS_ALLOWED_ORIGINS. В Compose API внутри использует3001, PostgreSQL5432; наружные порты привязаны к127.0.0.1. MAP_TILE_URL — публичный template, не место для приватного ключа.

## Демо-пользователи и воспроизводимый сценарий

В шапке «Выбрать демо-профиль»: Айжан (`demo.ru@example.test`) и Бек (`demo.ky@example.test`). У них нет паролей. Временный bearer хранится в sessionStorage вкладки; это общие demo identities, не пользовательская авторизация. Не включать такой адаптер для приватных данных или публичной эксплуатации.

[Полный сценарий для двух клиентов](docs/DEMO.md) содержит ручные шаги, ожидаемые результаты и точную автоматическую проверку. Она использует два независимых BrowserContext, настоящий API/worker и UUID PostgreSQL DB:

```sh
npm exec -- playwright install chromium
npm run test:e2e -- --grep "two browser users compete"
```

На рабочем demo можно выполнить `demo:reservations`, `demo:trips`, `demo:realtime`, `mail:show`. Они читают секреты локально, не печатая их. Demo users должны быть без активной аренды; scripts создают настоящие записи, поездки/счета остаются в истории. Не запускать против данных проверяющего без учёта этого эффекта.

## Проверки

После setup и работающего PostgreSQL:

```sh
npm run verify
npm run test:db
npm exec -- playwright install chromium
npm run test:e2e
npm audit
```

`verify` = strict typecheck + unit + production build. `test:db` и E2E требуют CREATEDB; стандартный локальный PostgreSQL-пользователь имеет эти права. Каждый набор создаёт UUID-базу и удаляет только её; E2E сам запускает отдельные API/worker/Vite. Основная demo DB не очищается. Стандартная PostgreSQL-роль расширенная для разработки, не production role separation.

```sh
npm run test:acceptance
```

Отдельный реальный15-минутный тест:900s бронь, warning на12-й минуте, restart worker и expiry на15-й; без fake clock. Ожидайте около15минут. Его фактический прогон U017 сохранён в [аудите](docs/CASE11-AUDIT.md); этот исторический результат не выдаётся за новый запуск.

Для журналирования: `node scripts/check.mjs npm run verify`. Wrapper фиксирует реальные timestamps/exit code в WORKLOG, raw logs — в игнорируемом work/checks; проверенные свидетельства дополнительно в docs/evidence. Нельзя передавать секреты аргументами. Первые ошибки и последующие успешные повторы не удаляются.

## Что реализовано

- Leaflet/OSM карта, геозона, четыре статуса, доступный список, RU/KY и responsive UI. Клик маркера не переносит карту; отдельная кнопка показывает активный самокат. OSM attribution видима внизу.
- Атомарная бронь, отмена, warning/expiry, min charge, одно активное rental на user/vehicle, защита PostgreSQL constraints/locks и idempotency.
- Start/pause/resume/finish, серверное время и сохранённые intervals/rate/zone snapshots. Время каждого режима суммируется и округляется вверх отдельно; например61s движения+1s паузы =18сом. Деньги — целые minor units/BigInt; клиент не рассчитывает авторитетную цену.
- Polygon/MultiPolygon geofence: ручной finish вне зоны запрещён. Симуляция GPS/charge продолжается без клиента; worker после простоя догоняет состояние, при0% атомарно создаёт finish/invoice/notice/outbox.
- Public/private WebSocket snapshots после commit, REST recovery, одноразовые tickets и deadline browser session. Пауза/потеря связи не останавливают серверный учёт.
- Полная история поездок/счетов с cursor pagination20/default (API limit1–100), invoice details и идемпотентная демонстрационная approved/declined оплата.
- Локальное письмо со счётом/причиной: mailbox insert и outbox ack в одной PG-транзакции. Это доказанное одно локальное логическое письмо, **не exactly-once внешняя SMTP-доставка**.

## Документы для проверки

| Документ | Содержание |
| --- | --- |
| [SUBMISSION](docs/SUBMISSION.md) | Итог готовности, реальные проверки, ограничения, оставшиеся задачи |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Текущие процессы, модули, данные, транзакции, realtime/recovery |
| [REQUIREMENTS](docs/REQUIREMENTS.md) | Матрица требований и результаты |
| [DEMO](docs/DEMO.md) | Ручная и автоматическая демонстрация двух клиентов |
| [DEPENDENCIES](docs/DEPENDENCIES.md) | Пакеты, версии, лицензии, генераторы и заимствования |
| [DECISIONS](docs/DECISIONS.md), [WORKLOG](docs/WORKLOG.md), [PROMPTS](docs/PROMPTS.md) | Решения, честная хронология и сохранённые запросы |
| [BILLING](docs/BILLING.md), [SIMULATION-REALTIME](docs/SIMULATION-REALTIME.md) | Правила времени/денег/геозоны, worker, WS и почта |
| [SOURCES](docs/SOURCES.md) | Источники документации, геоданных и дизайна |

Troubleshooting: [Docker](docs/DOCKER-TROUBLESHOOTING.md). При `dockerDesktopLinuxEngine` или `dockerInference` сначала восстановите Docker Desktop; наличие CLI не означает работающий Engine. Не выполняйте factory reset/удаление volume для диагностики. Для API503 смотрите migrate/seed и heartbeats worker, сверяйте конфигурацию.
