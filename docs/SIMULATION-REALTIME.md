# Симуляция, фоновые задачи и синхронизация

Реализовано по [U010](prompts/010-simulation-realtime.md); фактические проверки — [REALTIME-REPORT.md](REALTIME-REPORT.md). PostgreSQL — источник состояний и времени. Клиент не присылает GPS, заряд, elapsed time или сумму.

## Сохранённая модель

На старте `trip_simulations` сохраняет lastAt, замкнутый маршрут, distanceMm/distanceRemainder, tickMs, скорость и коэффициенты расхода. Тариф/зона уже сохранены в rental. Для демонстрации маршрут — четыре стороны вокруг стартовой точки с side=6000 E7; это геометрическая модель, без дорожного роутера/телеметрии физического устройства. Свободные и забронированные самокаты стоят, riding движется, paused стоит и расходует заряд медленнее. Возврат заряда/charging пока не реализован.

`config/demo.json`: tick 3000ms, скорость 180 метров/мин, riding 100 bp/мин (1 процентный пункт), paused 20 bp/мин (0,2 п.п.). Параметры ограничены runtime schema. Изменение config не меняет уже сохранённую модель поездки. `vehicles.battery_remainder` — накопленный дробный расход, знаменатель 60000; сохраняется между поездками, чтобы частые старты не возвращали дробный заряд. Фактический заряд bp = batteryBp − batteryRemainder/60000. Публичный batteryBp имеет точность 0,01 процентного пункта с округлением вверх; доступность проверяет и остаток, поэтому показанные 15% могут оказаться уже чуть ниже порога и быть недоступны.

```text
consumedNumerator = previousRemainder + elapsedMs × drainBpPerMinute
newBatteryBp = previousBp − consumedNumerator div 60000
newRemainder = consumedNumerator mod 60000
msUntilEmpty = ceil((previousBp × 60000 − previousRemainder) / drainBpPerMinute)
```

Расход/время/расстояние интегрируются BigInt; длина рёбер округлена до целых mm, GPS интерполируется до целого E7. Денежных float нет. Несколько коротких ticks дают тот же результат, что один задержанный. Длительность ограничивается msUntilEmpty; дальнейшее движение/оплата не начисляются. Пауза сохраняет дробный distance remainder, но не добавляет движение.

## Фоновый процесс и переходы

Существующий worker выполняет reservation cleanup, simulation scan, local outbox delivery и очистку tickets. Номинальный tick — 3 секунды с возможной задержкой poll (по умолчанию 1 секунда); это не обещание realtime OS. Циклы одного процесса не перекрываются. Batch по умолчанию 50, очередь обрабатывается от старого anchor; несколько worker используют одинаковые locks и recheck внутри транзакции. Расчёт зависит от DB clock, не от числа циклов.

Порядок locks: idempotency → user → vehicle → rental → intervals → simulation → invoice/outbox. Worker начинает с user, почтовая доставка берёт только outbox. API pause/resume/finish сначала продвигает старый режим до текущего DB-времени, затем переключает interval. Поэтому между ticks не теряются движение/паузы. Общая finalization при manual/battery_depleted закрывает interval/rental, создаёт invoice, одно TRIP_FINISHED и один mail_outbox в одной транзакции. При depletion допустим автостоп вне зоны; manual по актуальному GPS по-прежнему запрещён вне polygon.

Если depletion наступает при продвижении команды, finish возвращает существующий счёт, pause/resume отклоняются TRIP_FINISHED. Если поездка уже завершена до команды, pause/resume отклоняются INVALID_RENTAL_STATE. Повторный finish с тем же либо новым ключом не создаёт новый логический результат. Старый idempotency replay остаётся историческим ответом; актуальное состояние читается через API. Причины в DTO/БД: finished_by_user и battery_depleted.

Без API/WS worker продолжает работу. Без worker сохранённые anchors позволяют догнать elapsed time при старте; окончательный invoice заканчивается в depletionAt, а не во время запуска. Пока catch-up не обработан, REST preview может временно показывать несверенную стоимость/статус; readiness становится 503 при устаревшем heartbeat. Никакой браузерный таймер не завершает аренду. При DB outage нет успешного изменения в памяти: транзакция откатывается/повторяется следующим циклом.

Миграция 0003 не выдумывает прошлое: существующая активная поездка схемы 3 получает anchor при первом наблюдении, без ретроспективного расхода до установки симулятора. Старые завершённые счета не получают письма задним числом. Новые завершения любого начавшегося ранее trip используют общий finalizer.

## Локальная почта и уведомления

Вместо SMTP/Mailpit выбран локальный PostgreSQL mailbox. Это разрешённая заданием эмуляция, не внешняя отправка. Invoice и outbox имеют UNIQUE rental/invoice; finished notification — UNIQUE(rentalId, code). Outbox содержит snapshot получателя/темы/plaintext тела и причину завершения. Worker выбирает pending строки FOR UPDATE SKIP LOCKED, вставляет `local_mailbox` и ставит deliveredAt в одной транзакции. Mailbox UNIQUE(invoiceId) + FK логического события защищают повтор. Ошибка между приёмом и ack откатывает оба действия; retry после commit видит уже доставленное сообщение. Нет внешнего вызова внутри tx.

Гарантия: ровно одно сохранённое локальное письмо на новый logical finish. Для обычного SMTP точно такую гарантию обещать нельзя: accept-before-ack требует идемпотентного получателя либо допуска дубля. Внешний mail transport потребует отдельного решения. UI отдельного почтового сервиса не нужен: `npm run mail:show` или GET /api/v1/mailbox с Bearer показывают последние 100 собственных писем. Пока только RU; история не пагинируется. Reservation warning/expiry — persistent private notification, не email. В offline вкладке немедленного toast нет, после reconnect уведомления восстанавливаются.

## WebSocket и API reconciliation

HTTP команды остаются единственным способом изменения состояния. PG statement triggers на vehicles/rentals/notifications/invoices/demo_payments/local_mailbox вызывают NOTIFY с постоянным payload `state`; IDs, токены и персональные данные туда не передаются. Сигнал приходит после commit, при rollback не приходит. Каждый API имеет выделенное LISTEN-соединение к той же БД, что его pool, и восстанавливает его после разрыва.

После сигнала с debounce 25ms API отправляет свежие полные snapshots. Периодический reconciliation (по умолчанию 3000ms) компенсирует потерю сигналов и обновляет стоимость. Сигналы могут объединяться: WS гарантирует восстановление актуального состояния, а не доставку каждого промежуточного события. Номер sequence и connectionId действуют только в одном соединении. Долговечного WS event log нет; persistent уведомления доступны через REST.

| Доступ | Формат |
| --- | --- |
| public | fleet_snapshot: connectionId, sequence, fleet; никаких владельцев/историй |
| private | state_snapshot: connectionId, sequence, state; fleet/current/notifications/invoices/mailbox только собственного user |

GET `/api/v1/sync` использует REPEATABLE READ READ ONLY для согласованного private snapshot. GET `/api/v1/vehicles` доступен публично. SDK перед каждой попыткой подключения сначала читает REST, затем открывает WS; первый socket snapshot закрывает окно между HTTP и подпиской. AbortController/epoch отбрасывают старые HTTP ответы, sequence отбрасывает старые кадры в соединении, reconnect backoff 0,5–10 секунд. Вкладка не хранит состояние поездки как источник истины.

WS `/api/v1/realtime` требует точный Origin из WS_ALLOWED_ORIGINS и subprotocol `samokettik.v1`. Без ticket доступен public fleet. Для private: Bearer POST `/api/v1/realtime/tickets` с `{}`, случайный 32-byte ticket на 30 секунд; в БД только SHA256. Клиент добавляет subprotocol `ticket.<hex>`. Atomic DELETE WHERE expiresAt > DB clock делает ticket одноразовым, в том числе между API. Токен/ticket отсутствуют в URL; сервер выбирает только публичное имя протокола. Повтор/истёкший ticket даёт 401, Origin вне allowlist — 403. Любая команда в WS закрывает сокет 1008: изменения проходят HTTP validation/idempotency.

Heartbeat 15s ping/pong, максимум 100 соединений, bufferedAmount limit 1MiB, входящий payload 1024 bytes. Все лимиты, кроме фиксированного read-only payload bound, заданы env. Настройте WS_ALLOWED_ORIGINS при смене порта/адреса frontend. Поддержаны nginx и Vite upgrade. Пока используется demo bearer adapter: нет готовых sessions/logout/refresh/Google или production abuse prevention. Native SDK поддерживает private токен только в памяти; техническая страница подключает public fleet.

## Проверка и границы

`npm run verify`, `npm run test:db`, `npm run test:e2e`, `npm run demo:realtime`, `npm run mail:show`; результаты — в отчёте. Isolated PG tests ускоряют только собственные config/deadlines. В основном demo остаются 900/180 секунд и 3-секундный tick. Полный 15-минутный прогон, 20–50 users load test, внешний SMTP, password/Google, продуктовые карта/аренда/history и RU/KY ещё не закрыты. До них проект не объявляется полностью готовым по всему исходному ТЗ.
