# Доказательства frontend U012/U013

Записано 2026-10-21T01:34:19.824+06:00. В [COMMANDS.json](COMMANDS.json) — 29 raw command logs с реальным start/end/exit/SHA-256. Они скопированы побайтно из work/checks. Сохранены 4 завершённых failed commands; прерванный первый browser run описан отдельно, полный log не выдуман. Playwright traces не публикуются, поскольку могут содержать временный demo credential; сохранены безопасные error-context из реального regression.

[Compose/nginx live smoke](live-smoke.json), [helper](helpers/check-live-frontend.mjs), [desktop RU](live-desktop.png), [mobile RU](live-mobile.png), [mobile KY](live-ky-mobile.png). E2E screenshots с префиксом e2e получены в отдельной PostgreSQL DB. Live screenshots — из основной Compose DB, без новых аренд/поездок/платежей. Temporary demo session issuance stateless, signing key и постоянные bearer не выдавались клиенту.
