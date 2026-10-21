# U015 — проверка UI

Записано 2026-10-21T16:07:17.684+06:00. [Точное задание](../../prompts/015-ui-stability.md), [контракты frontend](../../FRONTEND.md). Команды/реальное время/exit/SHA-256: [COMMANDS.json](COMMANDS.json), raw logs в logs/.

Исправления: явный выбор транспорта имеет приоритет над active rental для просмотра; карта не возвращается к своему самокату при выборе другого. Панель привязывает trip/reservation к показанному vehicle; своя аренда сохраняется на сервере и доступна отдельной кнопкой. Кнопка команды сохраняет исходный layout текста, поверх рисуется индикатор aria-busy; сообщение о восстановлении связи не добавляет строку в карточку. Disabled/ready/pending, API-сверка и реальная прокрутка на маленьких экранах сохранены.

Проверено:

- Финальный verify exit0: strict typecheck,42unit,production build.
- Full test:e2e exit0:28tests на настоящих отдельных API/worker/Vite/PostgreSQL UUID DB, без изменения основной demo DB.6 новых проверок: бронь/поездка с просмотром другого самоката и возвратом к своему, pause/resume при замедленных настоящих запросах, desktop/mobile. После добавления проверки полной видимости кнопки списка — focused4passed.
- Измерения [desktop](desktop-geometry.json) / [mobile](mobile-geometry.json):4действия RU/KY на экран,90кадров на действие, всего720кадров. Top/left/width/height/clientWidth/clientHeight/scrollHeight/scrollTop/actionsTop равны baseline на каждом кадре. Настоящий POST pause/resume и GET sync задержаны на400ms, данные не подменены. На обеих проверенных высотах нет переполнения карточки: scrollHeight=clientHeight.
- Просмотр другого при reserved/riding: выбран SK-006, своя аренда SK-005 сохраняет ID, второе бронирование disabled, свой маркер не становится selected; reconnect/REST сохраняет чужую карточку и видимый выбранный маркер. Кнопка возврата восстанавливает свою карточку/маркер.
- Скриншоты: [desktop ride](desktop-ride.png), [mobile ride](mobile-ride.png), [desktop inspect](desktop-inspect.png), [mobile inspect](mobile-inspect.png). Ride и mobile inspect просмотрены визуально.
- Docker обновлён только web (--no-deps), healthy. [Live smoke](live-smoke.json) через nginx/API/PG:desktop1440×900/mobile393×851,30markers,tiles загружены,overflow/page errors0; новые JS/CSS без4actual env secrets. Основные аренды/счета не менялись.

Сбои не скрыты: первый verify exit1 TS18048 (current possibly undefined), первый focused6failed на пустой startup странице из-за того же отсутствующего guard. Исправлено явной проверкой наличия current.trip/reservation. После добавления KY второй typecheck exit1 из-за string[] в actions, исправлено readonly tuple; финальный verify прошёл. Первые error-context сохранены в failures/; trace.zip не публикуется, поскольку может содержать временный bearer. Предупреждения FORCE_COLOR/NO_COLOR сохранены в логах.

Backend/схема/миграции этим UI-исправлением не менялись; отдельный test:db здесь не повторялся, E2E использовал настоящую PostgreSQL. Коммит/push не выполнялись. Предлагаемый commit: fix: stabilize ride controls and preserve scooter selection.
