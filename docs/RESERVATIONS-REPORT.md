# СамоКеттик — серверное бронирование

Основание: [U004](prompts/004-reservations-task.md). Реализован только серверный цикл брони. Поездки, оплата, симуляция, карта, продуктовый UI и WebSocket не начинались. Исходные команды/реальные timestamps/exit codes находятся в [WORKLOG.md](WORKLOG.md); полные логи этого этапа экспортируются в `docs/evidence/reservations/`.

## Результат

- Публичный GET `/api/v1/vehicles`: координаты, заряд, коды транспорта, available/reserved/unavailable. Чужие владельцы и private rental IDs не выдаются.
- POST `/api/v1/reservations`: атомарное создание, проверка режима обслуживания и заряда >=15%, одна активная бронь на самокат/пользователя.
- POST `/api/v1/reservations/:id/cancel`: только владелец; отменённая бронь повторно отменяется безопасно; на/после дедлайна возвращается RESERVATION_EXPIRED и фиксируется истечение.
- GET `/api/v1/rentals/current`, GET `/api/v1/notifications`: только собственные данные.
- Приватные уведомления RESERVATION_EXPIRING, RESERVATION_EXPIRED, RESERVATION_UNAVAILABLE хранятся в PostgreSQL. Это серверная запись, не показ в закрытой вкладке/не email.
- Отдельный worker в Compose и `npm run dev`; восстановление из сохранённых сроков после перезапуска, без setTimeout на каждую бронь.
- Новая миграция `0001_reservations.sql`, schema version 2. Миграция E1 не менялась.
- `npm run demo:reservations` проверяет гонку и replay на запущенном API и отменяет свою успешную бронь в конце.

## Атомарность и порядок блокировок

На уровне PostgreSQL созданы частичные UNIQUE(vehicle_id) и UNIQUE(user_id) для state='reserved'. Это последний рубеж независимо от проверок JavaScript. При добавлении поездок предикаты потребуется расширить на riding/paused вместе с новой миграцией; сейчас таких переходов нет.

Команда работает в READ COMMITTED транзакции: advisory transaction lock по user+Idempotency-Key → user FOR UPDATE → vehicle FOR UPDATE → rental FOR UPDATE. Конфликтующие запросы перечитывают состояние после ожидания. Интеграционный тест удерживает vehicle-lock, ждёт через pg_stat_activity **двух** ожидающих запросов к разным экземплярам API с разными пулами, затем освобождает блокировку: ровно один 201, второй 409, одна active row.

Idempotency-cache вставляется после захвата user-lock, вместе с доменным результатом в одной транзакции. Advisory lock берётся раньше. Это позволяет сохранить FK cache→users без взаимного deadlock на переходе двух FK key-share locks в user FOR UPDATE. UNIQUE(user_id,key) дополнительно защищает cache. Одинаковый key/operation/hash возвращает сохранённый результат, другой payload/operation — 409. Domain-отказы сохраняются тоже; инфраструктурная ошибка откатывает всю транзакцию.

Для истёкшей чужой брони основная транзакция откатывается, cleanup получает locks в обычном порядке user→vehicle→rental, затем исходная команда повторяется ограниченно. Нельзя захватывать чужого user после vehicle. Истечение/отмена и уведомление фиксируются одной транзакцией, уведомления имеют UNIQUE(rental_id,code) и составной FK владельца.

## Время и восстановление

Сервер получает целые epoch milliseconds из clock_timestamp() PostgreSQL после блокировок; клиентские часы/статусы/сроки не принимаются. При создании expires_at=reserved_at+900s, warn_at=expires_at−180s из config. Порог заряда также сохраняется в rental. Ранее созданные сроки не пересчитываются по новым настройкам worker.

Worker сканирует сохранённые due rows примерно раз в секунду, повторно проверяет под locks, записывает warning только в warn_at <= now < expires_at. Если во время всего warning-окна worker был выключен, после старта создаётся expiry без устаревшего warning. Истёкшая бронь больше не видна как действующая в списке/current; резервирование умеет lazy cleanup даже без worker.

При expiry ended_at копируется из expires_at непосредственно в SQL. Так не теряются микросекунды PostgreSQL, даже если существующая запись появилась вне обычного millisecond API. Каждый цикл worker завершается DB heartbeat; readiness проверяет недавний успешный цикл и config hash. Heartbeat агрегирован по задаче: это не монитор каждого отдельного процесса при нескольких worker. БД-недоступность не обновляет heartbeat; цикл повторяется.

## Подтверждённые проверки

| Проверка | Фактический результат |
| --- | --- |
| `npm run typecheck` | Exit 0, runtime/configs/tests |
| `npm test` | 4 passed |
| `npm run test:db` | 21 passed: 6 foundation + 15 reservations на новой изолированной PostgreSQL DB |
| `npm run build` | Exit 0; затем успешная сборка внутри Linux Docker |
| `npm run db:generate` | Exit 0: No schema changes после сохранённой миграции |
| `docker compose config --quiet` | Exit 0 |
| `npm run compose:up` | Exit 0; postgres/worker/api/web healthy, migrate/seed Exited(0) |
| `npm run demo:reservations` | Exit 0: на настоящем API статусы 201/409, replayMatches=true, бронь отменена |
| `npm run test:e2e` | 4 passed: существующая техническая страница, desktop/mobile, без регрессии подключения |
| Dev smoke | Exit 0: Vite 200, proxy count=30 после добавления третьего процесса worker |

В PostgreSQL integration проверены: одна бронь при двух одновременных HTTP-запросах; лимит пользователя; параллельный replay одного key; replay через новый API; конфликт payload/operation; cached rejection после освобождения транспорта; owner-only cancel; безопасные повторы cancel; 14,99%/15%; maintenance; валидация лишних полей/UUID/ключа/JSON; отсутствие и отключение demo auth; lazy expiry; два worker; приватность уведомлений; expiry/cancel race; дедлайн после ожидания lock; SQL-ограничения напрямую; падение заряда; worker readiness.

Отдельный тест запускает реальный worker как дочерний Node-процесс: без браузера появляется один warning, процесс и HTTP API закрываются, срок проходит во время остановки; новый процесс worker восстанавливает expiry, новый API видит актуальное состояние и прежний idempotency result. Тест использует явные сроки **4/2 секунды**, а worker читает сохранённые сроки, не переписывая их по default config. Стандартные **900/180 секунд** проверены в строке созданной брони. Полный 15-минутный wall-clock прогон на этом этапе не проводился.

## Неудачные проверки и исправления

- Первый typecheck: неверный `readOnly` в Drizzle transaction config; исправлено на accessMode='read only'.
- Первый DB run: 14 failed/6 passed из-за предположения, что raw execute Drizzle отдаёт timestamptz как Date. Прямая диагностика показала строку. Исправлено на целые epoch milliseconds из PostgreSQL; не добавлялся клиентский clock fallback.
- Следующий run: 3 failed/17 passed. CHECK ended_at=expires_at выявил потерю микросекунд при переводе дедлайна через JavaScript Date. Исправлено SQL-копированием исходного значения. Затем все 20 прошли; после дополнительной проверки отключённого demo auth и malformed JSON итог — 21 passed.
- Неудачные прогоны не удалены из WORKLOG/evidence. Переименование черновой ещё не развёрнутой миграции выполнялось до применения на основной демо-БД. Инструментальный patch, не применившийся из-за пути/контекста, повторён корректно; это не запуск приложения и не успешный тест.

## Ограничения и решения этапа

Полноценного email/password/Google login пока нет. Вместо доверия произвольному userId используется явно включаемый **локальный** demo Bearer adapter с двумя разными случайными секретами. Setup не печатает токены; HTTP Authorization редактируется в логах. Это не production authentication и не закрывает требования R34/R35.

Одна активная бронь на пользователя — выбранное правило этого этапа. Проверки долгов/зоны не добавлены: счетов и согласованной зоны ещё нет. Статусы riding/paused и переход начала поездки запрещены отсутствием соответствующих API и CHECK текущей схемы.

REST notifications сохраняются без вкладки, но push/WS/toast не реализованы. Сообщения сервера сейчас русские; полноценная RU/KY локализация — этап UI. При выключенном worker нельзя гарантировать показ ровно в warning-момент; после восстановления актуальные события обрабатываются по сохранённым дедлайнам.

20–50 уникальных пользователей в нагрузочном тесте не запускались; выполнен требуемый тест двух реальных конкурирующих пользователей с контролируемым DB-barrier. Обслуживание транспорта/изменение заряда пока только через fixtures в изолированных тестах, публичного admin endpoint нет.

Предложение коммита: `feat: add atomic reservations and persistent expiry worker`. Коммит/push не выполнялись. Следующий этап не начат.
