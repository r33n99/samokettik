# Проверка обязательного объёма кейса №11 — U023

Записано 2026-10-21T20:22:42.980+06:00. Основание — [точное уточнение пользователя](prompts/023-mail-scope-review.md), решение D59. Проверенная база Git **c2668054fef37f76d7440b8624a6b4657c88d11e** плюс новые проверки в integration/realtime.test.ts. **Все шесть уточнений подтверждены текущей реализацией. Прикладной код не переписывался.** Новая auth/OAuth/KY/SMTP не добавлялись.

| Уточнение | Реализация и доказательство | Результат |
| --- | --- | --- |
| Авторизация необязательна, достаточно проверить двух users | Айжан/Бек — два разных demo owner; реальные два BrowserContext и HTTP201/409; IR также два API/PG pools и20 service users | Подходит; email/password/Google не нужны для приёмки |
| KY интерфейс/письма необязательны | RU UI и RU mail; существующая KY версия сохранена без расширения | Не блокирует обязательный объём |
| Разрешена локальная почта | finish→mail_outbox; worker доставляет в local_mailbox и подтверждает ack одной PG-транзакцией | Подтверждено; внешний SMTP не требуется |
| После завершения ровно одно письмо со счётом | Manual integration:invoice1000minor,recipient/subject/body/time/lines/total,два worker,finish replay тем же и новым key,mailbox без изменений | Пройдено; [реальное письмо](evidence/mail-review/manual.json) |
| Автостоп при0%:счёт и объяснение причины | Riding и paused depletion,в том числе вне зоны:правильный invoice,subject/id/time/recipient,«Автоматическое завершение: аккумулятор полностью разряжен»,повторный finish/tick/mail не дублирует | Пройдено; [движение](evidence/mail-review/depleted-riding.json), [пауза](evidence/mail-review/depleted-paused.json) |
| Warning за3минуты, email не обязателен | Сразу после реального reserve сохранены duration900000ms и expires−warn180000ms; worker создаёт одну owner notification,WS/API/reconnect; E2E видит предупреждение | Пройдено; warning не создаёт invoice mail |

## Что именно проверено в письмах

Manual короткое движение+пауза:1минута×8KGS и1минута×2KGS,итого10.00KGS; reason finished_by_user. Автостоп riding:1.500s активного времени →8.00KGS,paused:1.500s паузы и0активного →2.00KGS. Сверены invoiceId/rentalId,получатель demo.ru@example.test,тема,ISO время завершения,раздельные тарифы/минуты,итог,причина и пояснение demo payment. Delivered body равен queued body; нет undefined/NaN. Это настоящие прочитанные SQL/API данные тестовой базы, не вручную сочинённые примеры. Depletion fixtures меняют elapsed/GPS/charge **только в UUID DB**, поэтому их расчётные endedAt могут быть раньше observedAt; рабочая конфигурация не ускорялась.

Exactly-one подтверждается не только количеством outbox: проверены ровно1 invoice/outbox/mailbox/finish notice,неизменность уже доставленного письма после replay,суммарно1 успешный приём при двух concurrent workers и0 новых при повторном poll. Отдельный тест искусственно отклоняет outbox ack trigger: транзакция откатывает и mailbox insert,после удаления fault два worker успешно принимают1письмо. Существующий process test останавливает API/worker,восстанавливает catch-up после разряда и проверяет1письмо/счёт/notice после свежего API/reconnect. Не заявляется внешний SMTP exactly-once: в разрешённой локальной модели sink и ack находятся в одной БД.

## Новые реальные результаты

- Focused integration/realtime:10passed,без изменений app code.
- Full PostgreSQL integration:**54passed**,exit0,конец 2026-10-21T20:20:13.045+06:00.
- Verify:**44unit + strict typecheck + production build**,exit0,конец 2026-10-21T20:19:34.383+06:00.
- Targeted Playwright:**8passed**,exit0,конец 2026-10-21T20:20:16.539+06:00:desktop/mobile,двухклиентская гонка,manual lifecycle/invoice/payment,warning/expiry,auto depletion и1mail/notice.

[Команды,start/end,exit и SHA256](evidence/mail-review/COMMANDS.json). SQL snapshot/API/worker/браузеры настоящие,бизнес-БД не заменена SQLite/mock. Основная demo DB не изменялась. Новый полный34browser run не нужен для test-only изменения: выполнены относящиеся к запросу8сценариев; старые34passed U021 остаются отдельным результатом. Реальный900s прогон U017 не повторялся и не выдаётся за новый: его [сохранённые времена](evidence/case11-audit/reservation-clock.json) подтверждают реальную12-ю/15-ю минуту; на U023 заново проверены180s deadline и доставка due notification/видимый UI через изолированные ускоренные fixtures.

## Актуальная оценка

[Матрица](SUBMISSION-MATRIX.md) и [критерии](REQUIREMENTS.md) больше не считают отсутствие R34/R35/KY mail/SMTP обязательными недоработками. Условия расширенной эксплуатационной готовности (PG host crash/backup restore,нагрузочный SLA,production roles/session/security) остаются честно обозначенными ограничениями; это не основания добавлять запрещённые сейчас функции. Исторические U017/U021 отчёты сохраняют результаты/времена и помечены как предыдущая оценка объёма.

Изменены только тесты и документация. Commit/push не выполнялись. Предлагаемый commit: **test: verify mandatory local mail and clarify case 11 scope**.
