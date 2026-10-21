# СамоКеттик — индекс сохранённых запросов

Актуализировано на U021. Тексты существенных пользовательских заданий сохранены точно в отдельных файлах. Их timestamps означают запись агентом, когда это указано, а не неизвестное время отправки пользователем. Исторический реестр сохранён без подмены в [PROMPTS-HISTORY.md](PROMPTS-HISTORY.md); реальные действия/запуски — [WORKLOG.md](WORKLOG.md). Системные инструкции и внутренние рассуждения не публикуются.

| ID | Сохранённый запрос | Назначение |
| --- | --- | --- |
| U000 | [000-user-instructions.md](prompts/000-user-instructions.md) | Глобальные предпочтения пользователя |
| U001 | [001-project-task.md](prompts/001-project-task.md) | 001-project-task.md |
| U002 | [002-foundation-task.md](prompts/002-foundation-task.md) | 002-foundation-task.md |
| U003 | [003-docker-issue.md](prompts/003-docker-issue.md) | Пользовательское уточнение во время E1 |
| U004 | [004-reservations-task.md](prompts/004-reservations-task.md) | 004-reservations-task.md |
| U005 | [005-booking-acceptance.md](prompts/005-booking-acceptance.md) | 005-booking-acceptance.md |
| U006 | [006-publish-repository.md](prompts/006-publish-repository.md) | 006-publish-repository.md |
| U007 | [007-secret-incident.md](prompts/007-secret-incident.md) | 007-secret-incident.md |
| U008 | [008-trip-lifecycle.md](prompts/008-trip-lifecycle.md) | 008-trip-lifecycle.md |
| U009 | [009-publish-trips.md](prompts/009-publish-trips.md) | 009-publish-trips.md |
| U010 | [010-simulation-realtime.md](prompts/010-simulation-realtime.md) | 010-simulation-realtime.md |
| U011 | [011-publish-realtime.md](prompts/011-publish-realtime.md) | 011-publish-realtime.md |
| U012 | [012-frontend-task.md](prompts/012-frontend-task.md) | 012-frontend-task.md |
| U013 | [013-frontend-direction.md](prompts/013-frontend-direction.md) | 013-frontend-direction.md |
| U014 | [014-fleet-distribution.md](prompts/014-fleet-distribution.md) | U014 — распределение транспорта |
| U015 | [015-ui-stability.md](prompts/015-ui-stability.md) | U015 — стабильная карточка и независимый выбор транспорта |
| U016 | [016-publish-frontend.md](prompts/016-publish-frontend.md) | U016 — публикация frontend и исправлений |
| U017 | [017-case11-audit.md](prompts/017-case11-audit.md) | U017 — полный аудит кейса №11 |
| U018 | [018-publish-case11-audit.md](prompts/018-publish-case11-audit.md) | U018 — публикация аудита кейса №11 |
| U019 | [019-history-map.md](prompts/019-history-map.md) | U019 — пагинация историй и навигация карты |
| U020 | [020-publish-history-map.md](prompts/020-publish-history-map.md) | U020 — публикация историй и навигации карты |
| U021 | [021-submission.md](prompts/021-submission.md) | U021 — подготовка к сдаче |

U013 сохраняет ответ выбора визуального направления «Карта». U019 содержит также последующее уточнение об attribution. U006/U009/U011/U016/U018/U020 — разрешения на отдельные commit/push, не разрешение публиковать будущие незавершённые этапы. U021 не содержит команды commit/push. Дополнительные служебные/agent-to-agent prompts не придумываются; субагенты по журналу не запускались.

U022 — [команда commit/push подготовки к сдаче](prompts/022-publish-submission.md): публикация завершённого U021 через аккаунт пользователя.

U023 — [уточнение обязательного объёма и почтовая приёмка](prompts/023-mail-scope-review.md): auth/Google/KY/SMTP необязательны; точно одно локальное invoice mail и причина автостопа обязательны, warning не обязан быть email.

U024 — [команда commit/push почтовой проверки](prompts/024-publish-mail-review.md): публикация проверенного U023 через аккаунт пользователя.

U025 — [актуальная оценка готовности перед историей](prompts/025-submission-current-status.md): основной SUBMISSION по U023,старый текст отдельным историческим документом.

U026 — [коммит и push актуального отчёта](prompts/026-commit-submission-status.md): публикация документационного этапа U025 по явной команде пользователя.
