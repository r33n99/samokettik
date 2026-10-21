# Пакеты, генераторы и заимствования

Инвентаризация U021 из текущих package.json и установленных package metadata. Точное транзитивное дерево/integrity — package-lock.json; обновление зависимостей не выполнялось ради сдачи. Таблица перечисляет прямые зависимости, не полный юридический SBOM.

| Пакет | Закреплённая версия | Использование | Область | Лицензия metadata |
| --- | --- | --- | --- | --- |
| @playwright/test | 1.64.1 | Два браузера и screenshots | root:dev | Apache-2.0 |
| @sinclair/typebox | 0.34.52 | DTO и runtime validation | apps/server:runtime, apps/web:runtime, packages/contracts:runtime | MIT |
| @types/leaflet | 1.9.21 | Type declarations | apps/web:dev | MIT |
| @types/node | 24.10.0 | Type declarations | root:dev | MIT |
| @types/pg | 8.23.1 | Type declarations | apps/server:dev | MIT |
| @types/react | 19.3.0 | Type declarations | apps/web:dev | MIT |
| @types/react-dom | 19.3.0 | Type declarations | apps/web:dev | MIT |
| @types/ws | 8.18.2 | Type declarations | apps/server:dev | MIT |
| @vitejs/plugin-react | 6.1.2 | React Vite transform | apps/web:dev | MIT |
| drizzle-kit | 0.31.11 | Миграции SQL/snapshots | apps/server:dev | MIT |
| drizzle-orm | 0.45.4 | SQL/transactions/schema | apps/server:runtime | Apache-2.0 |
| fastify | 5.12.7 | HTTP server/validation | apps/server:runtime | MIT |
| leaflet | 1.9.4 | Карта/GeoJSON/markers | apps/web:runtime | BSD-2-Clause |
| pg | 8.23.1 | PostgreSQL driver | apps/server:runtime | MIT |
| react | 19.3.1 | Интерфейс SPA | apps/web:runtime | MIT |
| react-dom | 19.3.1 | DOM rendering | apps/web:runtime | MIT |
| sass | 1.105.2 | Компиляция компонентных SCSS | apps/web:dev | MIT |
| tsx | 4.23.15 | Host TS scripts/dev | apps/server:dev | MIT |
| typescript | 7.0.2 | Strict compiler | root:dev | Apache-2.0 |
| vite | 8.3.4 | Dev server и frontend build | apps/web:dev | MIT |
| vitest | 5.0.5 | Unit/PG integration | root:dev | MIT |
| ws | 8.22.0 | WebSocket server/client | apps/server:runtime | MIT |

Внутренний @samokettik/contracts0.1.0 — workspace package, не внешний сервис. Tailwind, shadcn/ui, Radix, react-leaflet, Prisma, Redis, Kafka, Mailpit и платёжные SDK не установлены. Компоненты и авторские SCSS написаны для проекта; native dialog адаптирован под выбранный UI. PostgreSQL btree_gist — bundled extension для EXCLUDE, устанавливается сохранённой SQL-миграцией, не npm-пакет.

## Изображения контейнеров и инструменты

Dockerfile/compose.yaml закрепляют Node24-bookworm-slim, PostgreSQL18-bookworm и nginx1.28-alpine по SHA256 digest. Версии фактически запущенных сред и ограничения cache указаны в SUBMISSION.md. На host применяются engines из package.json. Npm workspaces/lockfile задают установку; dependency override esbuild0.25.12 для @esbuild-kit/core-utils сохранён по D28. Deprecated @esbuild-kit/core-utils/esm-loader остаются upstream dev-зависимостями Drizzle Kit; npm ci предупреждает об этом. npm audit — снимок advisories, не доказательство отсутствия всех уязвимостей. Runtime server image построен из build stage и включает dev tooling; multi-stage pruning и минимизация образа — дальнейшее улучшение.

## Генераторы и AI

- Drizzle Kit генерирует SQL/snapshot/_journal, SQL проверяется и дополняется ограничениями/triggers/metadata до первого применения. Применённые миграции0000–0005 не переписывались на U021; ручные изменения существующего volume через drizzle-kit push не выполняются.
- TypeScript/Vite/Sass генерируют dist/browser assets; dist не является авторским source и не коммитится. JSX/TypeBox/SCSS исходники входят в Git.
- scripts/setup-env.mjs генерирует локальные случайные secrets средствами node:crypto; seed — повторяемые demo fixtures, не реальная телеметрия и не настоящие пользовательские аккаунты.
- Симулятор GPS/charge реализован в backend; маршруты синтетические, elapsed time и остатки хранятся в PG. Это часть приложения, не сторонний GPS API или AI-модель в runtime.
- Codex использовался как coding agent под контролем пользователя для проектирования, кода, тестов и документации. Точные существенные пользовательские запросы — PROMPTS.md/prompts; реальные действия/ошибки/времена — WORKLOG.md. Нет оснований приписывать неизвестное время или внешние prompts; системные инструкции/внутренние рассуждения не публикуются. Отдельных subagents в этом проекте не запускалось по журналу.
- Prettier3.9.10 ранее использовался как временный formatter через npm exec (записи U012/U015); в package runtime/dependencies не добавлен. Генератор готового scooter-sharing проекта, create-vite и shadcn CLI в сохранённых командах не зарегистрированы; не заявляем их использование.

## Данные, шрифты, дизайн и исходники

- Геозона — полный OSM MultiPolygon relation8493930, сохранённый через Nominatim. Источник, дата получения и attribution — config/service-zone.json; ©OpenStreetMap contributors, ODbL. Это OSM snapshot, не юридическая/официальная зона парковки. [Источник](https://www.openstreetmap.org/relation/8493930), [условия](https://www.openstreetmap.org/copyright).
- Карта — внешние OSM standard tiles по HTTPS. Attribution видна, Referer/cache не подавляются, bulk/prefetch не реализован. [Политика tiles](https://operations.osmfoundation.org/policies/tiles/). Это отдельный сетевой сервис, доступность которого не гарантируется проектом.
- Golos Text и Geologica поставляются self-hosted TTF с OFL1.1 рядом в apps/web/public/fonts и docs/design-research/frontend/fonts. Исходные URL/SHA/cmap для ҢңӨөҮү — [исследование](design-research/frontend/README.md) и font-check.json. Чужие коммерческие шрифты не копировались.
- Опубликованные Whoosh/Bolt использовались как UI-референсы, без копирования их прикладного кода/изображений. Lime вернул browser403 и не использовался как подтверждённый визуальный референс. SVG/icons/рисунок самоката написаны в проекте, не заимствованы из внешнего набора. Конкретные наблюдения и выбор пользователя сохранены в исследовании U012/U013.
- Использование npm-пакетов, документации и геоданных не равно копированию готового решения. По журналу готовый сторонний проект не копировался; нельзя доказать абсолютную уникальность каждого короткого типового фрагмента. Ссылки на официальные технические материалы — [SOURCES.md](SOURCES.md).
- Лицензия на оригинальный проект пока не выбрана владельцем; MIT/Apache или разрешение на публичное распространение автоматически не назначаются. Условия сторонних компонентов/шрифтов/геоданных сохраняются независимо от этого.
