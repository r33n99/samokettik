# СамоКеттик — технические решения

Статус: архитектурная основа принята командой U002 начать E1; таблица ниже сохраняет исходные варианты E0. Реально принятые решения E1 перечислены после таблицы. Новые продуктовые правила, почтовый режим, точная зона и будущий UI не выбираются молча. Реальные отметки подготовки и проверок — в WORKLOG.md.

| ID | Решение / статус | Причина | Альтернативы и цена выбора |
| --- | --- | --- | --- |
| D01 | Предложено: npm workspace, модульный backend, api+worker из одного проекта | Маленькая команда, три дня; общий доменный код и независимый lifecycle фоновых задач | Один процесс проще, но перезапуск HTTP останавливает фон; микросервисы избыточны |
| D02 | Предложено: PostgreSQL 18 + Drizzle + pg | Атомарные изменения и ограничения, явные SQL row-lock; соответствует стеку | ORM-only не заменяет блокировки; Redis-lock не нужен; PostGIS пока избыточен |
| D03 | Предложено: единый rentals aggregate для брони/поездки | UNIQUE active vehicle/user защищают сквозной жизненный цикл | Раздельные reservations/trips требуют отдельной occupancy-таблицы или сложнее координируются |
| D04 | Предложено: READ COMMITTED + locks user→vehicle→rental, UNIQUE active | Достаточно для инвариантов, прозрачные конфликты | SERIALIZABLE везде увеличит retries; in-memory mutex не защищает несколько процессов |
| D05 | Предложено: occupied-status вычисляется из rental, доступность из charge/mode/zone | Избегаем противоречащих полей vehicle.status и rental.state | Денормализованный status требует дополнительных механизмов согласованности |
| D06 | Предложено: интервалы riding/paused, snapshot правил в rental | Проверяемая тарификация и восстановление | Ежеминутные списания по setInterval зависят от задержек и теряют данные при restart |
| D07 | На согласовании: пропорциональный billing, округление half-up один раз до minor | Разбиение на паузы/тики не меняет сумму; без float | Каждая начатая минута — допустимая иная бизнес-модель, должна быть выбрана заранее |
| D08 | Предложено: clock_timestamp после locks, единый t на операцию, ms precision | Не стартовать истёкшую бронь после ожидания; нет client-clock доверия | now() до ожидания устаревает; миллисекунды проще согласовать с Node/DTO, чем микросекунды |
| D09 | Предложено: DB deadlines + worker scanning + catch-up | Переживает restart, не требует внешней очереди | setTimeout на каждую бронь теряет задачи; BullMQ потребует Redis |
| D10 | Предложено: HTTP-команды, WS invalidation, DB NOTIFY hints, full snapshots | Небольшой fleet, простое восстановление без replay-log | Долговечный per-client event replay сложнее; sequence cursor может пропускать поздние commits |
| D11 | Предложено: idempotency key + request hash + response в domain transaction | Безопасный retry при потерянном HTTP-response | Только отключение кнопки не решает повторные сети/две вкладки; TTL не нужен для демо |
| D12 | Предложено: invoice+email event в той же финализирующей транзакции | Нет завершённой поездки без счёта/задачи письма | Отправка SMTP внутри транзакции держит locks и не обеспечивает атомарность двух систем |
| D13 | На согласовании: локальный идемпотентный demo-mail transport | Строго проверить одно принятое письмо без внешней зависимости | Это не внешняя доставка; Mailpit SMTP только at-least-once; внешняя idempotency ограничена контрактом провайдера |
| D14 | Предложено: сохранённые маршруты/seed, симуляция elapsed-time, carry remainder | Детерминированные тесты, recovery, независимость от tick count | Случайный сдвиг градусов и drain-per-tick искажают скорость/заряд при задержке |
| D15 | На согласовании: симуляция продолжается при server downtime; stop в расчётный 0% | Сохранённое время и правила позволяют восстановить сценарий | Freeze на время инцидента — другая политика оплаты и симуляции; сейчас явно не задана |
| D16 | На согласовании: одна active rental/user, старт из брони, долг блокирует новую бронь | Упрощает UX и ограничения, демонстрирует postpaid flow | Можно разрешить direct-start/много аренд/аренду с долгом, но надо изменить контракты/тесты |
| D17 | Предложено: GeoJSON Polygon/MultiPolygon, версия и источник, граница включена | Одна зона для карты и серверной проверки | Bounding box неверно представляет весь город; PostGIS добавим только при реальной необходимости |
| D18 | Предложено: opaque cookie sessions + Argon2id, Google OIDC | Отзыв сессий, не хранить bearer в браузерном storage, без собственной криптографии | JWT refresh-flow сложнее; фейковый Google не закрывает требование |
| D19 | На согласовании: Sass modules + адаптированные Radix primitives, без Tailwind | Глобальная SCSS-инструкция; единый pipeline и свой UI | Предпочтительный Tailwind/shadcn можно сохранить отдельным pipeline, но добавится сложность; Tailwind v4 не предназначен для Sass |
| D20 | Предложено: TypeBox/Fastify JSON Schema contracts | Typed DTO и штатная runtime-валидация | Zod тоже применим, но параллельные схемы лишние; ORM model не является API validation |
| D21 | Предложено: Compose, поддерживаемые runtime, pinned dependencies | Воспроизводимый запуск и тесты с реальным PostgreSQL | Сейчас Docker daemon отсутствует; принятие архитектуры не является подтверждением запуска |
| D22 | Обязательно по указанию пользователя: исследование реальных UI-аналогов и несколько вариантов перед UI-кодом | Осмысленный минимализм и контроль дизайна | Сейчас нельзя считать выбранными палитру/шрифт/раскладку; библиотека прошлых исследований не универсальный дизайн |
| D23 | Обязательно по указанию пользователя: этапы и журнал без фиктивных запусков | Процесс также оценивается работодателем | Не переходить к реализации без команды; не включать AI/bot в Git authors/coauthors |

## Принятые решения первого технического этапа

Основание: [U002](prompts/002-foundation-task.md), отметка повторного аудита 2026-10-19T15:08:54+06:00. Пользователь явно расширил каркас начальной схемой и демо-данными.

- D01/D02/D20/D21: npm workspaces, React/Vite + Fastify, PostgreSQL/Drizzle/pg, TypeBox, strict TypeScript и Compose. Worker пока не запускается: фоновой бизнес-логики нет.
- D19: авторские стили временной технической страницы — SCSS modules. Компоненты Radix/Tailwind/shadcn не нужны этой странице и не устанавливались. Финальный продуктовый UI не выбран.
- D24: начальная миграция содержит только app_metadata/users/vehicles. Аренды, интервалы, счета и их ограничения будут добавлены вместе с соответствующими операциями. Это сохраняет малый scope и не выдаёт неиспользуемую схему за реализованную систему.
- D25: повторяемый seed вставляет детерминированные UUID/коды через ON CONFLICT DO NOTHING в одной транзакции; не сбрасывает существующие заряды/пользователей. Два demo user не имеют password_hash, авторизация отсутствует.
- D26: разделены liveness и readiness; readiness проверяет приложение-схему, а не только TCP/SELECT 1. Техническая `/api/v1/system` читает реальный count транспорта. Frontend валидирует ответы; Vite/nginx proxy сохраняют отдельный сетевой backend.
- D27: Dockerfile/Compose используют image digests; npm-зависимости точные, lockfile в Git. Результаты сборки проверены на Windows host Node 22 и в Linux Node 24 контейнере.
- D28: точечный override esbuild 0.25.12 для `@esbuild-kit/core-utils`, транзитивного dependency Drizzle Kit. Первоначальный audit выявил 4 moderate findings; `npm update esbuild`, чистый `npm ci`, audit и генерация миграций подтвердили исправленное дерево. Автоматический `audit fix --force` с downgrade Drizzle не применялся. Deprecated esm-loader/core-utils остаются upstream dev-dependencies.
- D29: `.env` генерируется локально без перезаписи, содержит случайный пароль, исключён из Git/Docker context; локальный API слушает loopback, в контейнере — 0.0.0.0. Compose ports публикуются только на 127.0.0.1. PostgreSQL timezone явно UTC, UI-конфигурация — Asia/Bishkek.
- D30: миграции применяет один процесс/одноразовый Compose service. Конкурентный ручной запуск migrator пока не поддержан; production roles и отдельные runtime images без dev-tools — за пределами локального каркаса.

Пропорциональная тарификация, долг/лимит аренды, политика downtime, Google credentials, транспорт писем и граница зоны остаются вопросами соответствующих этапов; на E1 бизнес-код для них отсутствует.

## Как фиксировать дальнейшее согласование

После ответа пользователя записать реальную ISO-временную отметку и точную ссылку/сохранённый текст ответа, сменить статус только явно согласованных решений. Если пользователь одобрит план целиком, перечислить, какие предложенные product defaults входят в одобрение. Нельзя обозначать открытый почтовый или географический вопрос решённым молча.

## Решения серверного бронирования U004

Основание — сохранённое задание [U004](prompts/004-reservations-task.md), аудит начат 2026-10-19T15:59:48+06:00. Точное время команд/результаты в WORKLOG; это отметка аудита, не выдуманное время получения сообщения.

- D03/D04/D08/D09/D11: реализован rentals aggregate в состояниях reserved/cancelled/expired, row-locks и частичные UNIQUE, DB-clock после ожидания, сохранённые deadlines, транзакционный idempotency result. Предикаты активной аренды расширятся вместе с поездками; сейчас riding/paused не поддерживаются.
- D31: отдельный worker использует DB scan и общий reconcile с HTTP lazy cleanup. Redis/брокер/таймер на каждую запись не нужны. UNIQUE уведомления и повторная проверка под locks защищают несколько worker.
- D32: до полноценной авторизации — только явный local demo adapter с двумя разными случайными Bearer-токенами из env. Arbitrary userId не принимается, токены не выдаются API и не печатаются. В runtime default adapter выключен; setup включает его только для локального демо. Email/password/Google не считаются выполненными.
- D33: per-key advisory transaction lock берётся до user-lock, а FK-bearing idempotency cache вставляется после user-lock. Так не возникает key-share/FOR UPDATE lock-upgrade deadlock на двух разных ключах одного пользователя. Хеш-коллизия advisory key только сериализует лишние операции, PK остаётся точным.
- D34: один reserved rental/user; бесплатная отмена до дедлайна; cancelled→cancelled повтор возвращает существующий результат, expired→cancel даёт 409 и не возвращает транспорт в прошлое состояние. Пропущенное warning-окно не порождает устаревшее warning после expiry.
- D35: уведомление — постоянная private DB-запись + REST owner endpoint, не браузерный toast, email или WebSocket. Показ в offline-браузере не обещается.
- D36: целые DB epoch milliseconds для server clock; ended_at при expiry копируется SQL из expires_at, сохраняя исходную точность. Это проверено тестами, выявившими raw timestamptz string и потерю микросекунд.
- D37: readiness учитывает версию схемы и свежий heartbeat с совпадающим hash business config. Heartbeat агрегирован по задаче, не per-process. Env содержит poll/batch/stale intervals. Существующие deadlines/minimumBatteryBp не пересчитываются при смене config.

Семантика replay: возвращается исходный результат, включая отказ; это не запрос текущего состояния. Для актуального состояния существует rentals/current. Срок хранения keys в демо не ограничен, автоматического удаления пока нет. Долг/зона/тарифы/письма остаются вне этого этапа.

- 2026-10-19T16:38:19.291+06:00 — уточнение проверки U005 без изменения архитектуры: idempotency сохраняет status/code/message бизнес-результата, а requestId ошибки относится к новому HTTP-запросу и не должен сравниваться на равенство при replay. Для проверки независимого expiry наблюдается непосредственно terminal row в PostgreSQL до последующих API-команд; ускорение касается только новой тестовой брони, не business config. Подробности: [BOOKING-ACCEPTANCE.md](BOOKING-ACCEPTANCE.md).

## Поездки и оплата U008 — 2026-10-19T17:24:17.442+06:00

- D07/D38: по заданию документировать поминутное округление выбрано ceil-per-mode-v1: суммарные riding/paused ms округляются вверх отдельно, один раз. Нулевое время бесплатно; дробление интервалов не добавляет платных минут. Исходная пропорциональная модель E0 не реализовывалась и заменена до кода. BigInt / PostgreSQL bigint, decimal-string DTO, тарифы в integer minor units.
- D06/D39: interval ordinal + timestamps, один открытый interval, btree_gist EXCLUDE от пересечений; состояние и тарифы/зона snapshot на start. Расчёт elapsed time переживает отсутствие клиента/API без таймеров. Единый idempotency executor брони переиспользован для поездок и оплаты с тем же lock namespace/key.
- D17/D40: реальный полный OSM MultiPolygon relation 8493930 сохранён с source/license/retrievedAt. Сервер использует E7 GPS из vehicle под lock, не из body. Включена граница, исключены внутренности holes; BigInt point-in-polygon без epsilon. Config source не объявляется юридическим подтверждением границы города.
- D12/D41: finish/interval close/invoice/idempotency атомарны. Оплата отдельной локальной demo command approved/declined, UNIQUE на invoice и receipt, FK суммы. Без эквайринга и автоматического списания. Правило долга не вводилось. Outbox/email, auto-depletion, simulator/WS/UI — отдельные этапы. Подробности и ограничения: [BILLING.md](BILLING.md).

## Симуляция и синхронизация U010 — 2026-10-21T00:32:53.263+06:00

Основание: [U010](prompts/010-simulation-realtime.md). Это время записи решений, не время отправки запроса. Подробные контракты — [SIMULATION-REALTIME.md](SIMULATION-REALTIME.md).

- D42: отдельный существующий worker и PostgreSQL scan, без Redis/брокера. LastAt, маршрут, distance и snapshots коэффициентов сохраняются в БД. BigInt-интеграция расхода и расстояния сохраняет остатки /60000; остаток заряда хранится на vehicle между арендами. Альтернатива tick-based списания ошибочна при задержках. GPS interpolation использует float только для геометрии, не денег/расхода.
- D43: pause/resume/finish сначала продвигают прежний режим до DB-clock под теми же locks. При разряде finish атомарно закрывает поездку в расчётную ms даже после downtime; вне зоны автостоп разрешён. Active rides из схемы 3 получают anchor при первом наблюдении: исторический расход до появления симулятора не выдумывается. Старые завершённые счета не получают письма задним числом.
- D44: finish общий для manual/battery_depleted: interval, rental, invoice, notification, mail_outbox в одной транзакции. Порядок locks: idempotency → user → vehicle → rental → interval → simulation → invoice/outbox. Worker без idempotency начинает с user; mail-worker блокирует только outbox. SQL UNIQUE защищает logical invoice/notification/mail.
- D45: выбран локальный PostgreSQL mailbox вместо Mailpit/SMTP. Приём в mailbox и ack в одной транзакции дают проверяемое одно логическое письмо при retry/crash. Для обычного SMTP нельзя обещать exactly-once после accept-before-ack; внешняя доставка потребует отдельного адаптера и пересмотра гарантии. Письма сейчас RU, не готовый RU/KY mail transport.
- D46: PostgreSQL transactional NOTIFY — только hint без персональных данных. Каждый API LISTEN-ит свою подключённую БД, после commit читает snapshots; reconciliation каждые 3s закрывает потерю hint. Полные snapshots проще durable event log для 30 самокатов. Они могут объединять близкие изменения, не гарантируют доставку каждого промежуточного события. Connection UUID/sequence ограничены одним соединением; REST resync перед каждым reconnect обязателен.
- D47: ws 8.22.0 + native browser WebSocket, read-only каналы. Public fleet без owners; private snapshot только владельцу по одноразовому SHA256 ticket (TTL 30s), bearer только HTTP, ticket в subprotocol, Origin allowlist. HTTP-команды сохраняют общую валидацию/идемпотентность. Максимум 100 клиентов, heartbeat и slow-consumer cutoff конфигурируемы. Полноценные sessions/logout/Google отдельно.
- D48: readiness schema 4 требует свежий heartbeat всей pipeline, дополнительно к reservation heartbeat, и совпадающий business config hash. Успех reservation scan не маскирует провал симуляции/почты. Агрегированный heartbeat не заменяет мониторинг каждого worker или queue lag.

## Frontend U012/U013 — 2026-10-21T01:15:42.020+06:00

Это время сохранения решения; время отправки ответа не предполагалось.

- D49: после трёх реально отрисованных вариантов пользователь выбрал [Карту](prompts/013-frontend-direction.md). Большая карта/плавающая карточка, mobile bottom panel, нейтральная бумажная поверхность + терракотовый CTA. Исследованы опубликованные Whoosh/Bolt; Lime browser403 явно исключён из visual evidence. Golos Text/Geologica self-hosted OFL, cmap фактических файлов содержит ҢңӨөҮү. Авторские styles только SCSS по компонентам.
- D50: Leaflet1.9.4 напрямую из React effect с cleanup, без react-leaflet wrapper и дополнительных UI/state библиотек. Доступный список альтернативен карте. Native dialog адаптирован по дизайну, даёт focus trap/Escape; не заменяет проверку серверных переходов.
- D51: отдельный enabled-only demo browser adapter, краткоживущий HMAC bearer с новым DEMO_SESSION_SECRET, два фиксированных seed-профиля, Origin allowlist. Постоянные CLI bearer не выдаются браузеру. Secret не попадает в Vite/bundle; профиль/временный credential — в sessionStorage вкладки. Это не password/Google auth. Публичный client-config устраняет хардкод тарифов/сроков в UI.
- D52: текущая цена — только server snapshot; countdown лишь отображает server deadline, time anchoring через performance.now. Ни локального finish при нуле, ни независимой симуляции. POST intent/key сохраняется до сети и переживает reload; uncertain result требует replay того же key, definitive refusal позволяет новое действие. Текущие fleet/rental/invoice локально не сохраняются.
- D53: E2E запускает отдельные настоящие API/worker/Vite и UUID PostgreSQL DB, не использует mock business backend и не меняет основной demo fleet. Trusted fixture changes для zone/expiry/depletion доступны только через тестовый PG pool, не добавлены в HTTP. Main Compose build и DB/process tests выполняются последовательно.

## D54 — распределение demo fleet U014 — 2026-10-21T15:18:21.3510304+06:00

Компактная сетка в центре заменена 30 явными seedLocations по всей MultiPolygon-зоне, с runtime-проверкой количества/уникальности/point-in-polygon. Повторяемый seed продолжает сохранять существующие данные; отдельная demo:redistribute изменяет координаты только незанятого демо-транспорта, в транзакции с vehicle locks по ID и повторным чтением активных rentals после lock wait. Никакого production GPS API; это запрошенное обновление демонстрационного расположения. Альтернатива расширить seedSpacing не учитывает сложную геозону и отдельные компоненты; автоматическое перемещение при запуске нарушило бы сохранность состояний. Подробности: [DEMO-FLEET.md](DEMO-FLEET.md).

## D55 — выбор транспорта и стабильность карточки U015 — 2026-10-21T16:01:46.4799725+06:00

Явно выбранный маркер имеет приоритет над activeId для просмотра; собственная аренда остаётся в серверном current и доступна кнопкой «Показать свой самокат». RentalPanel показывает управление только если выбранный транспорт совпадает с текущей арендой. При просмотре другого транспорта бронирование заблокировано с объяснением наличия своей аренды, серверная проверка сохраняется. Центрирование карты запускает явный выбор, а изменение своей аренды в фоне не перехватывает фокус другого маркера.

Текст кнопки сохраняется во время запроса; CSS-индикатор с абсолютным позиционированием и aria-busy не меняет размеры. Поддерживается prefers-reduced-motion. Дополнительная строка unavailableActions внутри карточки удалена: состояние связи уже отображает connection-strip; ready/disabled и REST-восстановление сохраняются. Нельзя исправлять скачок скрытием полезного overflow — небольшой экран продолжает позволять прокрутку при реальной необходимости.

## D56 — приёмочный аудит U017 — 2026-10-21T16:24:23.1196284+06:00

Отдельный test:acceptance выполняет реальные900секунд с неизменённым config и DB-clock в UUID PostgreSQL DB, отдельном API и worker; читает DB, не вызывает lazy reconcile для истечения. После warning worker перезапускается; история main DB не меняется. Обычные быстрые tests остаются быстрыми. Нагрузка20разных пользователей проверяется на уровне сервиса через два PG pool; отдельно сохранена реальная HTTP-гонка двух пользователей/двух API и двух BrowserContext. Это не объявляется20HTTP users или нагрузочным SLA.

Найден security defect: private WS жил дольше signed browser bearer. Добавлено nullable auth_expires_at в одноразовый ticket (Drizzle-generated0004, metadata5), handshake TTL ограничен сроком bearer; потреблённый deadline переносится в connection state, timer закрывает socket1008, flush проверяет срок до и после await. Static CLI credentials имеют null deadline и не отключаются каждые30секунд. Одной памяти процесса недостаточно: ticket может выдать API A, а погасить B. Старая схема и данные аренд не переписываются; при upgrade удаляются только короткоживущие старые tickets, которые не содержат auth deadline. Browser E2E использует реальные60s sessions только в изолированном окружении; main TTL3600 не меняется.


## D57 — Пагинация историй и явное перемещение карты (U019)

- GET /api/v1/trips и GET /api/v1/invoices возвращают items и nullable nextCursor; параметры cursor UUID и limit1–100 (default20) проходят TypeBox/Fastify validation. Порядок — ended_at/id DESC для finished trips, created_at/id DESC для invoices; курсор содержит id последней записи. Timestamp anchor извлекается подзапросом PostgreSQL с проверкой owner/state: микросекунды не теряются при преобразовании в JS Date. Неизвестный/чужой cursor даёт пустую страницу. Вставка новой записи в начало не сдвигает продолжение; Back перечитывает страницу по сохранённому cursor. Фиксированный snapshot между разными HTTP-запросами не обещается.
- Выбран keyset вместо OFFSET: не сканирует пропущенные страницы и устойчив к новым поездкам. Drizzle0005 добавляет составные индексы под сортировку, metadata/readiness —6; существующие migrations не переписываются. Номер страницы — позиция в текущем стеке, глобальное число страниц/count не вычисляется.
- React History читает оба списка из отдельных paginated API, а не из100 последних invoices в sync. AbortController предотвращает запоздалые ответы при смене view/profile/cursor. Смена профиля пересоздаёт History; reconnect, изменение invoices и оплата перечитывают текущую страницу. Back/Next/Retry сразу показывают loading, ошибки можно повторить; offline блокирует переходы. WS snapshot сохраняет100 записей как ограниченную сверку текущего состояния, это больше не предел доступной истории.
- Клик маркера меняет только выбранный самокат; autoPanOnFocus отключён. Explicit locate активного и выбор из списка могут переместить карту. ActiveId/sync сами не центрируют её, включая повторное открытие map.
- Leaflet prefix отключён через официальную опцию; видимая OSM attribution перенесена в нижний край, под mobile sheet оставлено24px. Пользователь дополнительно попросил убрать attribution; полное скрытие не применено из-за условий текущих tiles. Источники: [Leaflet attribution](https://leafletjs.com/reference.html#control-attribution-prefix), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/#2-attribution-and-licensing), [PostgreSQL row comparison](https://www.postgresql.org/docs/current/functions-comparisons.html#ROW-WISE-COMPARISON).
