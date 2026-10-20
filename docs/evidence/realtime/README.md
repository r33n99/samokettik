# Доказательства U010

Сохранено 2026-10-21T00:35:52.977+06:00. Исходные логи из work/checks скопированы побайтно; SHA-256 в [COMMANDS.json](COMMANDS.json). Сохранены **все** 35 команд данного этапа, включая 6 с ненулевым exit и одну ложную успешную отметку CLI db:generate (BigInt diagnosticFailure=true). Ошибки проверки и окружения разобраны в [отчёте](../../REALTIME-REPORT.md).

[Прямой read-only результат PostgreSQL](live-database.json), [helper](helpers/check-realtime-persistence.mjs), [desktop](desktop.png), [mobile](mobile.png). Helper запускался из корня как work/check-realtime-persistence.mjs; скопированный файл — доказательство, не npm entrypoint. Скриншоты получены Playwright в проверке U010; имя исходных файлов foundation — историческое, содержание актуально.

Логи PostgreSQL содержат ожидаемые ошибки negative/rollback tests (test mail ack crash, FK/CHECK/UNIQUE/EXCLUDE), а также отдельный настоящий recovery. Они не являются все ошибками приложения. Полная raw command evidence включает старые локальные абсолютные пути и синтетические demo UUID/email, без локальных паролей/токенов. Полный state dump/pg diagnostics не публикуется.
