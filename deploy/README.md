# Деплой лендинга

Лендинг — standalone Vite-сборка, живёт на **корне** доменов рядом с SPA-приложением;
разделение сделано на уровне nginx, **без pm2** (nginx отдаёт статику напрямую).

| Домен | Ветка/триггер | Каталог на VM | Секрет |
|-------|---------------|---------------|--------|
| `dnd-crime-staging.gistrec.cloud` | PR в `main` (`staging-deploy.yml`) | `~/DndCrimeLandingStaging/dist` | `STAGING_DEPLOY_KEY` |
| `dnd-crime.gistrec.cloud` | push/merge в `main` (`prod-deploy.yml`) | `~/DndCrimeLanding/dist` | `PROD_DEPLOY_KEY` |

После успешного staging-деплоя workflow создаёт или обновляет комментарий со ссылкой
в PR. После merge и успешного production-деплоя отдельный комментарий со ссылкой на
production добавляется в тот же PR. Для этого workflow используют `pull-requests: write`.

Сборка: `base` = `/l/` (см. `vite.config.ts`), поэтому ассеты лендинга отдаются по `/l/…`
и не конфликтуют с `/assets/…` приложения. CTA «Войти» ведут на относительный `/login`.

## Split на nginx

Снипеты из `deploy/nginx/` подключаются в соответствующих server-блоках (443) **до** `location /api/` и `location /`:

```nginx
include /etc/nginx/snippets/landing-static-prod.conf;   # прод: dnd-crime.gistrec.cloud
include /etc/nginx/snippets/landing-static.conf;         # стейджинг: dnd-crime-staging.gistrec.cloud
```

- `location = /` → `index.html` лендинга;
- `location /l/` → ассеты лендинга (immutable-кэш);
- `location /assets/`, `location /`, `location /api/` → SPA-приложение и Go-бэкенд (без изменений).

## Деплой-ключи (безопасность)

Каждый ключ на VM ограничен через `rrsync` записью в `~/.ssh/authorized_keys`:

```
command="/usr/bin/rrsync -wo /home/gistrec/DndCrimeLandingStaging",restrict ssh-ed25519 …  # staging
command="/usr/bin/rrsync -wo /home/gistrec/DndCrimeLanding",restrict        ssh-ed25519 …  # prod
```

`-wo` = только запись, джейл на каталог лендинга. Все пути rsync анкорятся в корень джейла,
`..` запрещён — выхода наружу (в `~`, `/etc` и т.п.) нет. Поэтому workflow заливает в `dist/`,
а `--delete` затрагивает только `~/DndCrimeLanding{,Staging}/dist`.

## Ручной деплой (fallback, если CI недоступен)

```bash
yarn install --frozen-lockfile && yarn build
# staging:
rsync -az --delete -e "ssh -i <staging_deploy_key> -o ControlPath=none" \
  dist/ gistrec@germany.vps.gistrec.cloud:dist/
# prod: тот же ключ prod → :dist/ (ключ джейлит в нужный каталог)
```

> ⚠️ Никогда не указывай destination `/` при ручном деплое основным (полнодоступным) ключом
> и всегда добавляй `-o ControlPath=none` — иначе rsync `--delete` может уйти не туда.
