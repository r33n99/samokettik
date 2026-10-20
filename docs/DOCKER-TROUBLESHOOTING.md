# Docker Desktop на этой машине: ошибка dockerInference

Во время E1 пользователь прислал скриншот: Docker Desktop не смог удалить `%LOCALAPPDATA%\Docker\run\dockerInference` перед созданием listener, Windows сообщила `The file cannot be accessed by the system`.

Фактическая диагностика:

- Docker Desktop 4.44.3.202357; CLI/Engine после восстановления 28.3.2.
- Для каталога `C:/Users/Rinni/AppData/Local/Docker/run` у пользователя Rinni, Administrators и SYSTEM был FullControl.
- `dockerInference` имел `Archive, ReparsePoint`, дата файла — 4 октября; `fsutil reparsepoint query` вернул Error 1920. Это не обычная подтверждённая нехватка ACL-прав.
- Штатный `docker desktop stop --timeout 30` сообщил `Failed to stop Docker Desktop`.

2026-10-19T15:14:13+06:00 выполнено обратимое восстановление: завершены зависшие процессы `Docker Desktop`, `com.docker.backend`, `docker-desktop`; проверены абсолютный путь и отсутствие reparse point у самого родительского каталога; `Docker/run` переименован в `Docker/run.stale-20261019-151413`. Каталог `docker-secrets-engine` также проверялся, но сохранять его не потребовалось. Docker Desktop запущен снова через Start-Process с Hidden window style.

Проверка после восстановления: `docker version --format '{{.Server.Version}}'` вернул `28.3.2`; затем Compose успешно поднял PostgreSQL. Настройки, образы, volumes, WSL-дистрибутивы не удалялись; factory reset/переустановка/изменение ACL/отключение антивируса не выполнялись. Резервный каталог оставлен на месте.

Связанный upstream-отчёт: [docker/desktop-feedback #460](https://github.com/docker/desktop-feedback/issues/460). Он описывает сходные зависшие AF_UNIX sockets и обход переименованием родительского runtime-каталога. Это основание для диагностики, не гарантия причины любого будущего сбоя. [Issue #448](https://github.com/docker/desktop-feedback/issues/448) описывает аналогичный сбой `dockerInference`.

Не повторять принудительное завершение работающего Docker без необходимости: это прерывает контейнеры. При новой ошибке сначала проверить конкретный текст и штатную остановку; не удалять `%LOCALAPPDATA%\Docker` целиком и не выполнять `docker compose down -v` для решения ошибки сокета.

Повтор U010: 2026-10-21T00:15:27.563+06:00 зафиксировано восстановление после того же dockerInference crash. После проверки абсолютного пути и отсутствия reparse у родительского каталога runtime `Docker/run` переименован в `Docker/run.stale-20261021-001314`; аварийные Desktop/backend и зависший CLI завершены, Desktop запущен Hidden. Backup сохранён, volumes/settings не удалялись. Два infra:up exit1 и test:db ECONNREFUSED сохранены в evidence/realtime, последующий infra:up успешен. Позднейший отдельный PostgreSQL recovery во время параллельных build/tests не объявляется следствием сокета; его причина не установлена, разбор в [REALTIME-REPORT.md](REALTIME-REPORT.md).
