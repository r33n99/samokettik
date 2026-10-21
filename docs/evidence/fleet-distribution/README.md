# U014 — фактические проверки

Записано 2026-10-21T15:22:23.509+06:00. Команды, реальные timestamps, exit codes и SHA-256 исходных логов — [COMMANDS.json](COMMANDS.json).

- verify: typecheck, 42 unit tests, build — exit0.
- test:db: 49 tests на изолированных PostgreSQL UUID-базах — exit0. Новые проверки: все компоненты геозоны, reserved/riding/paused не перемещаются, повтор ничего не меняет, реальное ожидание PostgreSQL lock и commit брони перед повторным чтением.
- test:e2e: 22 desktop/mobile сценария — exit0.
- compose:up: пересборка, миграции/seed exit0, postgres/API/worker/web healthy.
- Финальный typecheck — exit0.
- [live-result.json](live-result.json): основная demo DB, перемещены30, active0, все30 уникальны и внутри геозоны; заряд/сервис/число аренд/счетов/платежей сохранены; 2 параллельных WS клиента + REST получили координаты PostgreSQL. Это явное обновление demo fleet по запросу пользователя, не fault fixture и не новый production GPS API.
- Повтор demo:redistribute: moved0, skippedActive0, missing0 — exit0.
- [browser-result.json](browser-result.json): [desktop](desktop.png) и [mobile](mobile.png), 30 маркеров, page errors/overflow0. Скриншоты просмотрены.

Предупреждения npm upstream deprecated/install-scripts и NO_COLOR/FORCE_COLOR сохранены в raw logs; это не ошибки завершения. Применённые миграции не изменялись. Git commit/push не выполнялись. Координаты искусственные, привязка к дорогам/парковкам не проверена.
