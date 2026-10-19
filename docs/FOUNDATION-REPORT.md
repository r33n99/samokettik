# СамоКеттик — отчёт первого технического этапа

Это исторический снимок E1. После него реализовано серверное бронирование; актуальное дополнение — [RESERVATIONS-REPORT.md](RESERVATIONS-REPORT.md).

Статус: технический каркас реализован и проверен, бизнес-логика не начата. Основание: [команда пользователя U002](prompts/002-foundation-task.md). Документ подготовлен после проверок; их реальные timestamps/команды/exit codes — в [WORKLOG.md](WORKLOG.md), полные логи и SHA-256 — [в комплекте доказательств](evidence/e1/README.md).

## Что создано

- Локальный Git main, без commit/remote/push; `AGENTS.md` с правилами этапов, типизации, данных, дизайна, журналирования и авторства.
- npm workspaces: `apps/web` (React/TypeScript/Vite), `apps/server` (Fastify/TypeScript), `packages/contracts` (TypeBox DTO).
- Strict TypeScript для runtime, Vite/Drizzle configs и тестов; SCSS modules и отдельные общие style-модули.
- PostgreSQL 18.6; Drizzle schema и первая SQL-миграция `0000_initial_foundation.sql`, snapshots/journal в Git. Три таблицы: app_metadata, users, vehicles.
- Повторяемый demo seed: 30 электросамокатов, два пользователя RU/KY без паролей. Existing data не сбрасываются.
- `.env.example`, генератор локального `.env` со случайным паролем без перезаписи; секреты исключены из Git и Docker context. Бизнес-параметры централизованы в config/demo.json и валидируются.
- Docker Compose: postgres → migrate → seed → api → web. Именованный volume, loopback ports, healthchecks, фиксированные image digests. PostgreSQL использует UTC, публичная конфигурация — Asia/Bishkek/KGS.
- API `/health/live`, `/health/ready`, `/api/v1/system`. Последний читает реальный count из PostgreSQL; frontend проверяет connection, валидирует response, показывает ошибку и умеет повторить запрос.
- README: полный Compose startup, host dev/hot reload, миграции/seed/check, тесты, Windows/npm.ps1 и диагностика.

## Фактическая проверка цепочки

| Граница | Результат | Доказательство |
| --- | --- | --- |
| UI в браузере | Пройдена | Playwright desktop 1440×900 и mobile Pixel 7; скриншоты просмотрены; нет горизонтального overflow/pageerror |
| Frontend → API | Пройдена | 4 E2E: настоящий nginx proxy, чтение данных, retry; отдельный mocked test только для сообщения ошибки |
| API → PostgreSQL | Пройдена | Drizzle count=30 из реальной БД, SQL version()=PostgreSQL 18.6 |
| Схема/seed | Пройдена | 6 integration tests в новой изолированной базе; повтор migration/seed и сохранение изменённой строки |
| БД недоступна | Пройдена | При фактическом stop postgres readiness=503, liveness=200 |
| Восстановление/volume | Пройдена | После up postgres readiness=200; 30 vehicles и 2 users сохранены |
| Dev/hot reload startup | Пройдена | `npm run dev` с изолированными портами: Vite HTML 200, proxy count=30; временные процессы остановлены |

Успешный E2E не заменён mock-БД. Ошибочный readiness-response подменяется только в отдельном тесте UI error/retry; это явно отмечено в test source. Конкурентная бронь пока не проверяется: такой функциональности нет.

## Запуски и результаты

| Проверка | Результат |
| --- | --- |
| Чистый `npm ci` после фикса lockfile | Exit 0, 0 audit vulnerabilities; upstream deprecated dev-loader warnings сохранены |
| `npm run setup`, повтор | Exit 0, существующий env оставлен без изменений |
| `npm run typecheck` | Exit 0, включая tests/tools |
| `npm test` | 3 passed |
| `npm run build` | Exit 0 на host Node 22.14.0, затем успешно внутри Linux Docker build на Node 24.22.0 |
| `npm run test:db` | 6 passed на настоящем PostgreSQL |
| `npm run test:e2e` | 4 passed, desktop/mobile |
| `npm run db:generate` после правки override | Exit 0: No schema changes |
| `npm run db:migrate`, повтор | Exit 0 |
| `npm run db:seed`, повтор | Exit 0; нет дубликатов и сброса данных |
| `npm run db:check` | 30 vehicles, 2 users, metadata version=1, SQL time UTC после настройки |
| `docker compose config --quiet` | Exit 0 |
| `npm run compose:up` | Exit 0; postgres/api/web healthy; migrate/seed Exited (0) |
| Dev smoke | Exit 0; frontend/proxy/API/DB соединены |
| Реальный stop/start БД | После исправления smoke-script exit 0; данные сохранены |
| `npm audit` | Exit 0, found 0 vulnerabilities на момент проверки; это не гарантия отсутствия любых дефектов |
| `git diff --check`, ignore env/work/outputs/node_modules | Exit 0, секретный env исключён |

## Ошибки, обнаруженные и исправленные

- Docker Desktop не стартовал из-за inaccessible dockerInference reparse point. У пользователя были FullControl-права. Сохранён только runtime-каталог сокетов, Docker запущен без factory reset/удаления данных. Подробно — [диагностика Docker](DOCKER-TROUBLESHOOTING.md).
- Первый typecheck обнаружил unknown error в error handler. Добавлено явное narrowing, последующий typecheck прошёл. Ошибка не скрыта из журнала.
- Initial npm audit: 4 moderate findings через старый esbuild в dev-dependency Drizzle Kit. Точечный override 0.25.12 и обновление lockfile устранили findings; чистая установка, генерация миграции и Docker build прошли. Deprecated upstream esm-loader/core-utils пока остаются.
- Дополнительный restart smoke сначала использовал неподдерживаемый на установленном Compose `start --wait`. БД осталась остановленной, поэтому последующие migrate/seed тоже завершились ошибками подключения. Скрипт исправлен на `up -d --wait postgres`; БД восстановлена, полный fault/recovery smoke и повторные migrate/seed/check прошли. Это ошибка проверочного скрипта, не замаскированный успешный запуск.

## Ограничения этапа

Нет авторизации, карты, бронирования, поездок, billing, оплаты, worker, WebSocket или отправки писем. Демо-пользователи не могут войти. Количество 30 в UI — данные БД, не реализованная аренда. География seed — искусственные точки в центре города, не утверждённая зона.

Временная страница русская, без финального RU/KY дизайна. Продуктовые референсы/варианты, выбор шрифта и проверка кыргызских переводов будут отдельным этапом.

Локальный DB-role имеет повышенные права для миграций/CREATE DATABASE тестов; production role separation, внешнее размещение и runtime-image slimming не заявляются готовыми. Мигратор надо запускать одним процессом. Гарантия писем, точный GeoJSON, Google credentials и спорные правила billing не выбраны этим техническим этапом.

Следующий этап не начат. Предлагаемый commit: `chore: bootstrap SamoKettik workspace and database foundation`. Коммит не создан по просьбе сначала предложить его.
