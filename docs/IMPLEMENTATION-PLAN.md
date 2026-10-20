# СамоКеттик — этапы реализации и критерии готовности

Статус: пользователь командой U002 разрешил E1 и начальные schema/seed из E2. Остальной план **не разрешение на автоматическое выполнение**. После каждого этапа — фактические проверки, обновление документации, предложение отдельного commit и ожидание команды. Оценки ниже — ориентиры будущей работы, а не затраченное время.

Каждый этап допускает несколько небольших изменений внутри своей области. Не собирать весь проект в один patch/commit. Не расширять scope этапа без объяснения и команды пользователя.

| Этап | Содержание | Критерий готовности / доказательство | Предлагаемый commit |
| --- | --- | --- | --- |
| E0 — завершён | Аудит папки, требования, архитектура, решения, риски, промпты | Документы проверены; пользователь разрешил архитектурную основу в U002. Архив E0 сохранён отдельно | `docs: define SamoKettik architecture and acceptance plan` |
| E1 — проверен | Инициализация Git после команды, npm workspace, TS strict, Compose, env schema, скелет API/web, health, Sass pipeline; по U002 также начальная схема/seed | Docker Engine восстановлен; чистая установка, typecheck, build, 3 unit + 6 PG integration + 4 E2E прошли; Compose и dev проверены; отчёт FOUNDATION-REPORT.md | `chore: bootstrap SamoKettik workspace and database foundation` |
| E2 | PostgreSQL schema/migrations, бизнес-config, зона, seed 30 vehicles, базовые fixtures | Миграции с нуля и повторный запуск, FK/CHECK/UNIQUE тесты, idempotent seed, config mismatch/invalid values rejected. Зона/источник явно одобрены | `feat: add rental schema and deterministic demo fleet` |
| E3 | Auth API: email/password, sessions, Google OIDC и access controls | Регистрация, неверный вход, logout/expiry, cookie/Origin; Google с настоящими credentials и callback. Если credentials отсутствуют — пункт остаётся открытым, этап нельзя назвать полностью закрывшим auth | `feat: add session authentication and Google sign-in` |
| E4 — серверный цикл проверен по U004 | Reserve/cancel, active rental, expiry checks, idempotency core; также reservation warning/expiry worker из E6 | Два конкурентных HTTP user через два API и DB-barrier; один user/два vehicle; 14,99%/15%; replay/new API, deadlines/restart; 21 PG integration tests, см. RESERVATIONS-REPORT | `feat: add atomic reservations and persistent expiry worker` |
| E5 — серверный цикл проверен по U008 | Start/pause/resume/finish, интервалы, billing, invoices/history, server zone checks | Переходы/ownership, независимый money oracle, split invariance, invoice UNIQUE, повтор finish, zero amount, config snapshot; ручной finish вне зоны | `feat: add ride lifecycle and exact billing` |
| E6 — серверный цикл проверен U010 | Worker: warnings/expiry, elapsed-time GPS/charge, depletion, NOTIFY/WS, reconnect | Реальные deadlines и ускоренные test config; два worker; offline клиент; рестарт API/worker; catch-up до 0%; гонки pause/tick/finish/expiry; readiness показывает lag | `feat: add persistent jobs and realtime simulation` |
| E7 — local mail и demo payment проверены; внешняя почта/RU-KY открыты | PostgreSQL outbox + локальный mailbox, demo payment, notifications/history API | Проверка crash-after-accept-before-ack; один logical email/invoice; отказ и повтор оплаты; параллельный pay; содержание письма/причина и RU/KY; внешняя проверка при выбранном external mode | `feat: add invoice delivery and demo payments` |
| E8a — дизайн | Исследование живых аналогов, анализ цветов/типографики/плотности/иконок, несколько разных visual variants | Ссылки и наблюдения в docs/design-research; пользователь выбирает вариант. Никакого автоматического перехода к E8b | `docs: record interface references and visual options` |
| E8b — frontend | Выбранный минималистичный UI: карта/доступный список, auth, active rental, RU/KY, история/оплата, уведомления | Сетевой API и WS, два клиента; keyboard/accessibility; actual glyphs; desktop/mobile browser review; offline/reconnect и ошибки | `feat: build bilingual scooter sharing interface` |
| E9 — приёмка | End-to-end сценарии, fault tests, полный 15-минутный прогон, README, чистый Compose запуск | R01–R46 со ссылками на фактические доказательства, либо явно открытые пункты; нет скрытых failing tests. Повторяемая demo-инструкция и проверка сохранности БД | `test: verify concurrent rentals and document local demo` |

Имена commit — предложения. Git инициализирован на E1; по U006 создан и опубликован первый commit 4d6bdcd. U008 добавляет серверный цикл E5 и demo payment из E7; U010 закрыл локальную почтовую эмуляцию E7, симуляцию и WS E6. Внешний транспорт/RU-KY, продуктовый UI/auth и полная приёмка E9 остаются открытыми; см. REALTIME-REPORT.md. Перед первым реальным commit повторно проверить effective user.name/email и author/committer environment overrides; должны соответствовать пользователю. Не менять историю, не добавлять ботов/AI в авторство/Co-authored-by. Результат E1 и точная граница реализованного — в FOUNDATION-REPORT.md; наличие seed не означает полного выполнения E2 с согласованной зоной и всей доменной схемой.

## Ориентировочная укладка в три дня

- День 1: E1–E4 — окружение, данные, auth, атомарная бронь. Примерный бюджет 8 часов.
- День 2: E5–E7 — поездки, тарификация, recovery/симуляция/WS, почта и оплата. Примерный бюджет 8–10 часов; это наиболее рискованный день.
- День 3: E8a–E9 — дизайн с быстрым выбором, frontend, два клиента, документация и приёмка. Примерный бюджет 8–10 часов.

Полный scope оценивается в 24–28 часов плотной инженерной работы плюс ожидания команд/credentials/исправления. Это не гарантия завершения за три календарных дня. В начале нужно определить, означают ли «три дня» три полных рабочих дня. Чтобы не потерять управляемость, при перерасходе показывать фактическое отставание и оставшиеся требования, а не удалять recovery/гонки/Google из отчёта. Источники UI можно исследовать в E8a раньше frontend, если пользователь отдельно даст команду на этот этап.

## Подготовительные условия

- Запустить Docker Desktop / Docker Engine до E1; текущий CLI не подключается к daemon. Агент пока настройки системы не менял.
- Согласовать billing policy, почтовый режим и его гарантию, путь получения/утверждения зоны, отклонение Tailwind→SCSS/Radix и дополнительные product defaults.
- Для настоящего Google login нужны OAuth credentials и разрешённый локальный callback; передача секретов только через локальные env, не docs/чат/Git.
- Если выбрана внешняя почта — credentials и подтверждённый sender; невозможность строгого SMTP exactly-once не исчезает после настройки.
- Определить remote repository, если нужен push; сейчас remote не существует, публикация в scope E0 не входит.

## Проверки: уровень и ограничение

Unit: money rational arithmetic, transition functions, point-in-polygon, charge integration/remainder, route advancement. Бизнес-время параметризуется во внутренних функциях, но production-time поступает исключительно от БД; test-only clock-control не доступен через публичный API.

Integration: отдельная тестовая БД/Compose profile, реальные транзакции и сеть, pool>1, barrier-start; failures на границах commit/response/mail-ack, контролируемый рестарт процессов. Не заменять PostgreSQL SQLite или in-memory repository. Тесты не должны просто повторять формулу production: использовать независимые эталоны и инварианты.

E2E: два независимых Playwright BrowserContext с разными пользователями, настоящие api/worker/PG; desktop и mobile viewport; доступность действий, RU/KY, отключение WS и восстановление. Tiles можно стабилизировать fixture в автоматических тестах, отдельно проверяя live OSM по правилам сервиса.

Длительный прогон: один реальный 15-минутный reservation test с warning на 12-й минуте. Короткие тесты deadline/restart используют отдельный validated test config, а не подменяют демонстрационные значения в отчёте.

Каждый результат логируется с реальным timestamp, командой, exit code, кратким итогом и ссылкой на артефакт. Тесты запускаются по соответствующему изменению; успешные проверки не повторяются бесконечно без новой причины.
