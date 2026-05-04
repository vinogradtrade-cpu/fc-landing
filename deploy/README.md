# Deploy — fc-landing

Чистая статика. nginx отдаёт файлы из `/opt/fc-landing/current/` напрямую.
Релизы — каталоги в `releases/<sha>/`, активный — через симлинк `current`.
pm2 не используется (для статики не нужен).

## Архитектура

```
/opt/fc-landing/
├── current -> releases/<sha>/        # симлинк на активный релиз
├── releases/
│   ├── <sha1>/
│   ├── <sha2>/                       # хранится 5 последних
│   └── ...
└── shared/
    └── (пока пусто; для статики нет stateful-данных)
```

GitHub Actions при пуше в `main`:
1. упаковывает репо в tar.gz (без `.git`, `.github`, `deploy`, `.DS_Store`, `.env`),
2. `scp` на VPS,
3. распаковывает в `releases/<sha>`,
4. атомарно переключает симлинк `current` (через `mv -T`),
5. чистит старые релизы (оставляет 5),
6. дёргает `https://<PUBLIC_HOST>/` — должно вернуть 200.

nginx **не перезагружается** на каждом релизе: он резолвит симлинк на каждый запрос.

---

## Bootstrap (один раз перед первым деплоем)

### 1. DNS

A-запись на `<домен>` → `187.77.88.238`. Проверка:

```bash
dig +short media-konveyer.ru   # подставь свой домен
# должно вернуть 187.77.88.238
```

### 2. Создать репозиторий на GitHub

Через `gh` CLI локально (из корня проекта):

```bash
cd /Users/nikitavinogradov/Projects/fc_lend_for_seller
git init -b main
git add .
git commit -m "Initial commit: fc-landing static site + deploy pipeline"
gh repo create vinogradtrade-cpu/fc-landing --public --source . --remote origin --push
```

Или через веб: создай пустую репу `vinogradtrade-cpu/fc-landing`, потом:

```bash
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:vinogradtrade-cpu/fc-landing.git
git push -u origin main
```

> Push сразу триггерит workflow — **не пушь в `main`, пока не выполнен шаг 4 (bootstrap на VPS)** и не заданы Secrets, иначе деплой упадёт. Можно сначала запушить в ветку `init` или установить Secrets перед `git push`.

### 3. GitHub Secrets

В Settings → Secrets and variables → Actions добавь:

| Secret | Значение |
|---|---|
| `VPS_HOST` | `187.77.88.238` |
| `VPS_USER` | `clawd` |
| `VPS_PORT` | `22` (опционально, дефолт 22) |
| `VPS_SSH_KEY` | приватный ключ ed25519 целиком (см. ниже) |
| `PUBLIC_HOST` | боевой домен без `https://`, например `media-konveyer.ru` |

`VPS_SSH_KEY` — содержимое локального файла `~/.ssh/claude_agent` (приватный ключ, многострочный, начинается с `-----BEGIN OPENSSH PRIVATE KEY-----`). Его публичная часть (`~/.ssh/claude_agent.pub`) уже лежит в `~clawd/.ssh/authorized_keys` на VPS — этот же ключ используется для алиаса `vps-claude` в `~/.ssh/config`. Получить содержимое:

```bash
cat ~/.ssh/claude_agent
```

И вставить в GitHub Secret целиком (включая обе строки с `BEGIN`/`END`).

### 4. Bootstrap каркаса на VPS

Один раз — создаём структуру каталогов и nginx-конфиг.

```bash
ssh vps-claude
sudo mkdir -p /opt/fc-landing/{releases,shared}
sudo chown -R clawd:clawd /opt/fc-landing
exit
```

Залить nginx-конфиг (с локальной машины из корня репы):

```bash
# Подставь боевой домен:
DOMAIN=media-konveyer.ru
sed "s/__PUBLIC_HOST__/${DOMAIN}/g" deploy/nginx.fc-landing.conf.example \
  | ssh vps-claude "cat > /tmp/fc-landing.conf"

ssh vps-claude '
  sudo mv /tmp/fc-landing.conf /etc/nginx/sites-available/fc-landing.conf &&
  sudo ln -sf /etc/nginx/sites-available/fc-landing.conf /etc/nginx/sites-enabled/fc-landing.conf &&
  sudo nginx -t &&
  sudo systemctl reload nginx
'
```

После этого nginx уже отвечает на http (но без файлов — `current` ещё не существует, будет 404 / 500). Это нормально, дальше идёт первый деплой.

### 5. HTTPS через certbot

```bash
ssh vps-claude '
  sudo certbot --nginx \
    -d media-konveyer.ru \
    -d www.media-konveyer.ru \
    --non-interactive --agree-tos -m vinogradtrade@gmail.com --redirect
'
```

Подставь свой домен и e-mail. Сертификат автообновляется через системный таймер (он уже настроен под другие сервисы).

### 6. Первый деплой

После всего вышеперечисленного — обычный `git push origin main`. Workflow `Deploy fc-landing` сам разложит первый релиз и переключит `current`.

---

## Update (обычный релиз)

```bash
git add .
git commit -m "..."
git push
```

GitHub Actions всё сделает. Логи — в Actions tab репозитория.

---

## Rollback

```bash
ssh vps-claude
cd /opt/fc-landing
ls -1t releases     # список релизов, сверху самые свежие
ln -sfn /opt/fc-landing/releases/<previous-sha> /opt/fc-landing/current
ls -la current      # убедиться, что симлинк указывает на нужный релиз
curl -fsS -o /dev/null -w "%{http_code}\n" https://media-konveyer.ru/
```

nginx не нужно перезагружать.

---

## Логи и диагностика

```bash
ssh vps-claude

# Состояние
ls -la /opt/fc-landing/current
ls -1t /opt/fc-landing/releases | head

# nginx
sudo tail -f /var/log/nginx/fc-landing.access.log
sudo tail -f /var/log/nginx/fc-landing.error.log
sudo nginx -t

# Локальный health (без https)
curl -i http://127.0.0.1/ -H 'Host: media-konveyer.ru'
```

---

## Изоляция от существующих сервисов

| Что | Значение | Не пересекается с |
|---|---|---|
| `/opt/fc-landing` | свой каталог | `/opt/ai-creator`, `/opt/finances`, `/opt/minio`, `/opt/openclaw` |
| nginx site `fc-landing` | свой конфиг | `wtf-mmm.online`, `krasnoleto`, `vidnoai`, `sproutto`, `razdaci-tg` |
| pm2 / порт | **не используются** | — |
| GitHub repo `vinogradtrade-cpu/fc-landing` | свой | `vinogradtrade-cpu/finances`, `vinogradtrade-cpu/ai-creator`, `vinogradtrade-cpu/avito-agent` |

Workflow на VPS делает только `mkdir`, `tar -x`, `ln -sfn`, `mv -T`, `rm -rf` внутри `/opt/fc-landing/`. Чужие каталоги, pm2-процессы, systemd-сервисы и nginx-конфиги не трогаются.

---

## Чек-лист перед первым `git push origin main`

- [ ] DNS A-запись домена → `187.77.88.238` уже распространилась (`dig +short`)
- [ ] Репа `vinogradtrade-cpu/fc-landing` создана и `origin` настроен
- [ ] GitHub Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `PUBLIC_HOST` заданы
- [ ] `/opt/fc-landing/{releases,shared}` создан, владелец — `clawd:clawd`
- [ ] `/etc/nginx/sites-enabled/fc-landing.conf` залит, `nginx -t` ок, `nginx reload` сделан
- [ ] HTTPS-сертификат выпущен certbot'ом (или вынесен на следующий шаг — тогда healthcheck в workflow сначала упадёт, это ожидаемо)
