# Отчёт frontend U012/U013

Реализован выбранный пользователем вариант **Карта** по [U012](prompts/012-frontend-task.md) и [U013](prompts/013-frontend-direction.md). Время составления: 2026-10-21T01:34:19.824+06:00. Коммит и push текущего этапа не выполнялись.

## Реализованное

React UI: Leaflet/OSM карта с30 настоящими markers и серверным MultiPolygon, выбор из карты/доступного списка, карточка статуса/заряда/тарифа, бронь с серверным deadline и отменой, start/pause/resume/finish с подтверждением, server cost, история поездок/счетов и demo approved/declined payment. Desktop floating panel и mobile bottom panel, RU/KY, проверенные файлы Golos Text/Geologica с ҢңӨөҮү. Сначала исследованы опубликованные аналоги и отрисованы три самостоятельных варианта; [исследование](design-research/frontend/README.md) и реальный выбор сохранены. Это рабочий UI, статическая поездка24сом из макета в приложение не переносилась.

Два явно общих demo-профиля Айжан/Бек, временный HMAC bearer, server-only signing key, Origin allowlist, выключенный runtime default. Это не password/Google login. Тарифы/сроки не зашиты в JS, выдаются public config из business settings. Отдельные api/worker/PG по-прежнему владеют состояниями и стоимостью. Browser storage содержит только credential/display preferences/pending request metadata, не локальную симуляцию. HTTP/WS/storage boundaries валидируются TypeBox.

Loading/error/offline/reconnect: API-before-WS reconciliation; offline команды отключены, поездка продолжается на worker. Неопределённый ответ сохраняет тот же idempotency key и body через reload, новая команда блокируется до replay. Definitive отказ показывает понятный текст/requestId. Серверные warning отображаются в броне; новые finish/expiry notifications появляются один раз с датой. Исторические события при первом входе остаются в inbox и не изображают автостоп новой поездки.

## Фактические проверки

| Команда | Результат | Что подтверждено |
| --- | --- | --- |
| [npm run verify](evidence/frontend/logs/2026-10-21T01-32-25.797+06-00-npm.log) | exit0, **40 unit**, typecheck/build | Typed boundary/retry, временные demo credentials/подпись/expiry/подмена/disable; BigInt formatting выше Number safe range; прежние billing/geofence/simulation tests |
| [npm run test:db](evidence/frontend/logs/2026-10-21T01-19-33.529+06-00-npm.log) | exit0, **45 PostgreSQL integration**,4files | Прежние43 + public config/origin/demo HTTP и disabled chooser; реальные транзакции/API/process recovery, новый signing secret не выдаётся |
| [npm run test:e2e](evidence/frontend/logs/2026-10-21T01-27-00.011+06-00-npm.log) | exit0, **22 Playwright**, desktop/mobile | Настоящие API/worker/Vite/PG, весь rental/payment flow и сетевые ошибки |
| [Финальный typecheck](evidence/frontend/logs/2026-10-21T01-26-12.532+06-00-npm.log) | exit0 | Frontend/server/tools/tests строгие, без type bypass |
| [npm run compose:up](evidence/frontend/logs/2026-10-21T01-28-52.646+06-00-npm.log) | exit0, api/web/worker/postgres healthy | README сборка/upgrade, migrate/seed0; schema4 сохранена |
| [Live smoke](evidence/frontend/logs/2026-10-21T01-30-55.571+06-00-node.log) | exit0, desktop1440×900 и mobile393×851 | nginx→API→PG/WS,30markers, actual tiles, RU/KY, pageerror0, horizontal/vertical overflow false, старый toast не показан; served JS/CSS не содержат4 локальных secret values |
| [npm audit](evidence/frontend/logs/2026-10-21T01-27-31.847+06-00-npm.log) | exit0,0 vulnerabilities | Установленное dependency tree на момент проверки |

Браузерные сценарии: real map/zone/list/RU-KY; complete tile outage с сохранением данных; startup503 и retry; принудительный WS close и REST restore; **два независимых BrowserContext** и barrier двух настоящих POST201/409; cancel освобождает; start/pause/resume/finish даёт invoice1000minor (8+2сом), UI history/оплата согласованы с PG и один receipt; offline worker продолжает GPS/charge; response-lost-after-commit + reload + same-key replay создаёт одну бронь; вне polygon настоящий409 без invoice, после trusted return finish успешен; одно warning/expiry и доступность; depletion создаёт ровно один invoice/notice/local mail и видимый новый toast.

E2E запускает собственную UUID PostgreSQL DB и3 дочерних процесса, после завершения удаляет только её. Координаты/срок/charge меняются только в изолированном test pool; production test-control endpoints не добавлялись. Основная Compose DB не очищалась и не использовалась для fault mutations. Финальная проверка списка test databases вернула пустой список. Полного15-минутного ожидания не было: тест ускоряет свой persisted deadline, demo config900/180s/3000ms остаётся прежним.

[Live desktop](evidence/frontend/live-desktop.png), [live mobile](evidence/frontend/live-mobile.png), [live KY](evidence/frontend/live-ky-mobile.png), [running ride mobile](evidence/frontend/e2e-frontend-ride-mobile.png), [pause mobile](evidence/frontend/e2e-frontend-pause-mobile.png), [счета](evidence/frontend/e2e-frontend-invoices-mobile.png) просмотрены. Main live captures дождались загрузки tiles и fonts; ранние E2E screenshots могут показывать промежуточный tile fade, это не подменённая карта.

## Неудачные прогоны и исправления

- Browser research Lime получил403 verification: визуальные выводы по нему не делались. Whoosh/Bolt200, стили и скриншоты сохранены. Первый capture Whoosh до загрузки анимации был пустым; повтор после fonts/animation дал реальную страницу. Python fontTools отсутствовал: TTF cmap проверен Node без добавления app dependency. Первый prototype server неправильно ожидал Sass в nested workspace node_modules, исправлен обычный import sass.
- Typecheck: GeoJSON excess properties исправлены прямой geometry в Leaflet; childEnv inferred type исправлен NodeJS.ProcessEnv; новый UI format unit import требовал явного .js при NodeNext, исправлено. Сырые exit1 логи сохранены. Это не успешные проверки.
- Первый E2E запуск прерван после известных1passed/5failed: неоднозначные marker/list и retry selectors, login timeout из-за декоративной стрелки в accessible name. Исправлены scoped selectors и aria-label/aria-hidden. Полный wrapper log не появился, потому что parent был прерван; результат не придуман. Остаточная DB проверена по точному UUID, времени2seed users и0connections и удалена без FORCE. Посторонний Node/Vite в соседнем проекте не трогали.
- После desktop10passed добавление toast выявило regression полного набора: **18passed/2failed**. History и ServerNotice имели одинаковый sibling key ru; stale/дублированный DOM скрывал payment error внутри dialog. Исправлены разные prefixes history:/notice:, добавлено ожидание единственной history panel; полный набор20passed. Raw regression error-context сохранён в evidence/frontend/failures.
- Visual QA заметил старый auto-stop toast поверх следующей поездки. Добавлены baseline/announcement metadata, дата и запрет перекрывать другой active rental. Новый event всё ещё виден и сохранён в inbox; browser assertions проверяют отсутствие старого toast и наличие нового depletion toast. Финальный набор22passed.
- Полные logs содержат npm upstream deprecation/allowScripts notices и FORCE_COLOR/NO_COLOR warning. Они сохранены, audit0 не означает отсутствия этих warnings.

## Границы этапа

Password/Google и production sessions/logout/revocation, cursor pagination (история сейчас100), KY письма/независимая native-language review, внешний SMTP и нагрузочная/длительная приёмка остаются открыты. Карта использует best-effort OSM tiles с attribution, без bulk/prefetch, демонстрационные GPS по геометрическому контуру не являются дорожной навигацией. Реального эквайринга/управления физическим замком нет. Наличие общего demo chooser не закрывает auth требования R34/R35.

Предложение коммита: **feat: add responsive rental frontend and two-user demo mode**. Следующий этап и commit/push автоматически не выполняются.
