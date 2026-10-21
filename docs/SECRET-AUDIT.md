# Проверка возможного Generic Password incident

Записано 2026-10-19T16:54:34.021+06:00. Запрос: [U007](prompts/007-secret-incident.md).

**Результат: утечка действующих локальных секретов не подтверждена. Точная причина внешнего инцидента пока не установлена.** Пользователь не передавал ссылку, путь или строку срабатывания; эти сведения запрошены без значения секрета. Закрывать инцидент как false positive по одним косвенным данным нельзя.

## Что проверено

- Remote main и local HEAD: 4d6bdcde101286c0632bc8e9889861a1a8b1c7d7. Репозиторий r33n99/samokettik остаётся private.
- Все доступные Git refs: 1 commit, 165 blobs, включая сохранённые command logs. Точное сравнение с текущими локальными POSTGRES_PASSWORD, DEMO_USER_RU_TOKEN, DEMO_USER_KY_TOKEN, DATABASE_URL и их URL/base64 представлениями выполнено в памяти без вывода значений. Совпадений нет. Это не обнаруживает неизвестные или ранее изменённые секреты.
- .env отсутствует в Git, .env.example содержит заглушки. Пароль в шаблоне не является текущим паролем БД. compose.yaml использует env references, а не литералы паролей. Синтетические URI в tests/unit/config.test.ts — тесты валидации, не рабочие credentials.
- Независимый Gitleaks 8.30.1 с default rules и redaction=100 проверил всю Git-историю: 1 commit, около 659434 bytes, **0 findings**, exit 0. Бинарник загружен из официального release gitleaks/gitleaks, SHA-256 zip сопоставлен с release checksums. Это другой движок, не воспроизведение GitGuardian.
- Проверены service credential/private-key patterns; совпадений нет.

## Доступ к инциденту

GitHub secret-scanning API вернул HTTP 404 с сообщением Secret scanning is disabled on this repository. Commit check-runs и statuses не содержат ссылки на инцидент. Это сведения о GitHub API, а не подтверждение отсутствия внешнего GitGuardian incident.

По [официальному описанию Generic password](https://docs.gitguardian.com/secrets-detection/detectors/generics/generic_password), детектор ищет присваивания значения переменным password/passwd/pwd и не выполняет проверку действительности пароля. Само имя детектора не определяет сервис или валидность секрета. Среди локальных кандидатов есть .env.example:4 и ссылки на окружение compose.yaml:3,16; ни один из них нельзя объявить точной причиной внешнего срабатывания без его location.

## Действия и ограничения

Действующие секреты и Git-история не изменялись, инцидент не закрывался, внешние сообщения не отправлялись. Если location подтвердит реальный пароль, сначала потребуется отозвать/заменить его в соответствующем сервисе: удаление строки из нового коммита не отзывает опубликованный пароль. До получения location нет доказательств, оправдывающих объявление инцидента ложным или выбор конкретного секрета для ротации.

Первый запуск Gitleaks завершил сканирование без findings, но wrapper scripts/check.mjs упал при записи имени лога, содержащего путь executable (ENOENT). App-код не менялся. Повтор через имя gitleaks.exe в PATH успешно записал raw log и exit 0. Неудачный wrapper-запуск не считается успешной журналируемой командой.

## Доказательства

- [Обход истории без значений секретов](evidence/secret-audit/history-audit.json).
- [Redacted Gitleaks JSON](evidence/secret-audit/gitleaks-history.json).
- [Raw scanner log](evidence/secret-audit/logs/2026-10-19T16-53-40.930+06-00-gitleaks.exe.log).

Воспроизведение сканера при установленном Gitleaks:

```sh
gitleaks git --log-opts=--all --redact=100 --no-banner --no-color --report-format=json --report-path=outputs/secret-audit/gitleaks-history.json .
```

Уточнение пользователя U008, записано 2026-10-19T17:24:17.442+06:00: «ложная тревога». Это сообщение пользователя; конкретный внешний location не предоставлялся. Самостоятельная проверка по-прежнему подтверждает только описанный выше объём.


U021: исходный текст выше — историческая проверка U007. Актуальная проверка доступных6commits и подготовленных исходников: [SUBMISSION.md](SUBMISSION.md) и [submission evidence](evidence/submission/README.md). Пользовательское уточнение «ложная тревога» уже сохранено в U008; внешний GitGuardian location этим новым сканированием не устанавливается.
