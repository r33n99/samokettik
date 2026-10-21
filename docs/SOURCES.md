# Источники и границы заимствования

Использованы официальные документы для проверки механизмов. Готовый проект, UI, готовая схема шеринга или чужой прикладной код не копировались. Текущая архитектура описывает реализованный код; первоначальное предложение сохранено в ARCHITECTURE-PROPOSAL.md. Ниже — исторические записи источников соответствующих этапов, без выдуманных повторных обращений. Свод пакетов/лицензий/генераторов и AI-использования — DEPENDENCIES.md; фактические временные отметки — WORKLOG.md.

| ID | Источник | Для чего использован |
| --- | --- | --- |
| S1 | [PostgreSQL: Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) | Row-lock и общий порядок блокировок |
| S2 | [PostgreSQL: Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html) | Уникальность только активных аренд |
| S3 | [PostgreSQL: Date/Time Functions](https://www.postgresql.org/docs/current/functions-datetime.html) | Различие transaction timestamp и clock_timestamp |
| S4 | [PostgreSQL: NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html) | Сигнал после commit, не надёжная очередь |
| S5 | [OpenStreetMap: Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) | Attribution, условия использования tile-сервера |
| S6 | [Fastify: Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) | JSON Schema и runtime-валидация |
| S7 | [Drizzle: Transactions](https://orm.drizzle.team/docs/transactions) | Транзакционный API и явная изоляция |
| S8 | [Tailwind: Compatibility / Sass](https://tailwindcss.com/docs/compatibility#sass-less-and-stylus) | Основание предложить единый SCSS pipeline |
| S9 | [Node.js Releases](https://nodejs.org/en/about/previous-releases) | Выбор поддерживаемого runtime |
| S10 | [PostgreSQL Versioning Policy](https://www.postgresql.org/support/versioning/) | Поддерживаемая major-версия; patch фиксировать при реализации |
| S11 | [Resend: Idempotency Keys](https://resend.com/changelog/idempotency-keys) | Ограниченное 24-часовое окно дедупликации, не бессрочная гарантия доставки |
| S12 | [Google: OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server) | Внешние credentials, redirect URI и серверный OAuth flow |

Применённые навыки:

- `supabase:supabase-postgres-best-practices`, файл `C:/Users/Rinni/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase-postgres-best-practices/SKILL.md`; прочитаны правила lock-deadlock-prevention, lock-short-transactions, lock-skip-locked и schema-constraints. Применено к обычному PostgreSQL, Supabase сервис не подключался.
- `vercel:create-a-backend`, файл `C:/Users/Rinni/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/create-a-backend/SKILL.md`; использован принцип выбора процессов по нагрузке. Развёртывание на Vercel не предлагается как зависимость задания.

UI-референсы для СамоКеттик ещё не исследованы: это отдельный этап перед проектированием UI. Чтение личной библиотеки референсов не считается исследованием опубликованных аналогов этого продукта.

## Дополнения E1

- [Drizzle + PostgreSQL setup](https://orm.drizzle.team/docs/get-started/postgresql-new): schema/config/generate/migrate. Выбран stable release из npm, prerelease/rc не установлен автоматически из примера документации.
- [Vite Getting Started](https://vite.dev/guide/): workspace SPA setup; фактические engines/dependency versions дополнительно проверены в npm registry.
- [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/): service_healthy и service_completed_successfully.
- [PostgreSQL 18 release](https://www.postgresql.org/docs/18/release-18.html): major-версия; реально запущена 18.6, что подтверждено SQL version().
- [Docker issue #460](https://github.com/docker/desktop-feedback/issues/460), [#448](https://github.com/docker/desktop-feedback/issues/448): сообщения разработчиков/пользователей о stale AF_UNIX sockets. Диагностика конкретной машины выполнена отдельно, инструкция из issue не исполнялась вслепую.
- [esbuild advisory GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99): URL и затронутый диапазон получены в фактическом npm audit JSON; patched dependency проверена чистой установкой и миграционным CLI.
- [Supabase Status](https://status.supabase.com/): опубликованный аналог технической страницы состояния; анализ в `docs/design-research/foundation-status.md`. Это не исследование будущего интерфейса аренды.

На E1 применены `vercel:verification` (полная цепочка browser→API→PostgreSQL), `vercel:react-best-practices` (проверка TSX, hooks cleanup, error states, доступность) и `sites:sites` только в ветке local-only. Стек/локальный запуск заданы пользователем; регистрация/публикация Sites не выполнялись. Навык computer-use прочитан для ориентации в инструментах, но Windows UI через него не управлялся; браузерные проверки выполнены Playwright.

## U004: конкурентное бронирование

Повторно прочитаны официальные PostgreSQL 18 [Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html), [Partial Indexes](https://www.postgresql.org/docs/18/indexes-partial.html), [Date/Time Functions](https://www.postgresql.org/docs/18/functions-datetime.html), Fastify [Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/). Применён `supabase-postgres-best-practices` с lock-deadlock-prevention/lock-short-transactions. SQL и прикладной код брони написаны для проекта; готовое чужое решение не копировалось. Фактическое поведение Drizzle raw timestamptz отдельно проверено запросом к локальной БД, а не предположено из TypeScript-аннотации.

## U008: поездки и геоданные

- [OSM relation 8493930](https://www.openstreetmap.org/relation/8493930), получено через Nominatim search city=Bishkek/country=Kyrgyzstan&format=jsonv2&polygon_geojson=1&limit=1. Данные © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright); сохранены все четыре части MultiPolygon без упрощения. Timestamp — в config/service-zone.json и WORKLOG.
- PostgreSQL [Range Types](https://www.postgresql.org/docs/15/rangetypes.html), [btree_gist](https://www.postgresql.org/docs/15/btree-gist.html) и [CREATE TABLE 18](https://www.postgresql.org/docs/18/sql-createtable.html): прочитаны официальные материалы по exclusion constraints, проверено исполнением на настоящем PostgreSQL. Ready-made application solution не копировалось; point-in-polygon и billing реализованы в проекте, источник геоданных указан отдельно.

## U010: симуляция, WebSocket и local mailbox

- [ws README](https://github.com/websockets/ws/blob/master/README.md): HTTP upgrade, ping/pong, Origin/auth и slow consumers. Версия ws 8.22.0 проверена npm registry, закреплена lockfile.
- [PostgreSQL 18 NOTIFY](https://www.postgresql.org/docs/18/sql-notify.html): доставка после commit, объединение одинакового payload и недолговечность сигналов; восстановление через REST/snapshot и periodic reconcile.
- Применён supabase-postgres-best-practices: короткие транзакции, одинаковый порядок блокировок, SKIP LOCKED только для outbox. Новые simulator/SDK/worker/mail реализации написаны для проекта; чужой готовый проект не копировался.

## U012/U013: frontend

[Опубликованные аналоги, fonts/OFL, реальные browser statuses и выбранный вариант](design-research/frontend/README.md). [Leaflet1.9.4 reference](https://leafletjs.com/reference.html) — marker/GeoJSON/cleanup; [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) — корректный HTTPS template, attribution/cache/Referer, отсутствие bulk/prefetch. ws/React snippets готовых приложений не копировались. Temporary formatter Prettier3.9.10 проверен npm registry и использован через npm exec, не добавлен в runtime dependencies.
