# Деплой CryptoSignal Pro на VPS (Ubuntu 24.04)

Инструкция: загрузка проекта на VPS, настройка, запуск и доступ по сайту.  
**Домен:** `http://cryptosignalpro.titanrust.ru/` (привязан к IP вашего VPS).  
Добавьте IP вашего VPS в разрешённые на OKX и при необходимости настройте прокси.

---

## 0. Быстрая установка (один скрипт)

Если проект уже загружен на VPS (git clone или rsync), можно поставить всё одной командой:

```bash
cd /opt/cryptosignal   # или путь к корню проекта
chmod +x install.sh
sudo ./install.sh
```

Скрипт **install.sh** автоматически:

- обновляет систему и ставит Node.js 20, PM2, nginx;
- ставит зависимости backend/frontend и собирает проект (от имени вашего пользователя);
- создаёт **backend/.env** из `backend/.env.example`, если его нет (PORT=3000, NODE_ENV=production);
- настраивает nginx для домена **cryptosignalpro.titanrust.ru** (прокси на `http://127.0.0.1:3000`);
- запускает приложение через PM2 (`cryptosignal`), сохраняет и настраивает автозапуск.

После установки:

- отредактируйте **backend/.env** (OKX ключи, прокси, пароль админки);
- при необходимости включите HTTPS:  
  `sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d cryptosignalpro.titanrust.ru`

Логи: `pm2 logs cryptosignal`, статус: `pm2 status`.

---

## 1. Структура проекта на VPS

На сервере должен быть **корень проекта** с такой структурой (как в репозитории):

```
/opt/cryptosignal/          # или /home/ubuntu/cryptosignal
├── backend/
│   ├── dist/               # после npm run build
│   ├── node_modules/
│   ├── src/
│   ├── package.json
│   ├── tsconfig.json
│   └── .env                 # создаёте на VPS, не коммитить
├── frontend/
│   ├── dist/                # после npm run build (index.html, assets/)
│   ├── src/
│   ├── package.json
│   └── ...
├── package.json              # корневой (build, start)
└── ecosystem.config.js      # для PM2 (запуск из корня)
```

Сервер (Node) запускается из **корня проекта** и отдаёт API + статику из `frontend/dist`.

---

## 2. Подготовка VPS (один раз)

Подключитесь по SSH и выполните:

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS (Ubuntu 24.04)
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
npm -v

# Менеджер процессов PM2 (рекомендуется)
sudo npm install -g pm2

# (опционально) Nginx как reverse proxy на 80/443
sudo apt install -y nginx
```

---

## 3. Загрузка проекта на VPS

### Вариант A: через Git (если репозиторий есть)

```bash
sudo mkdir -p /opt/cryptosignal
sudo chown $USER:$USER /opt/cryptosignal
cd /opt
git clone https://github.com/YOUR_USER/BotNot.git cryptosignal
cd cryptosignal
```

### Вариант B: через rsync с вашего ПК (Windows: WSL или Git Bash)

На **вашем ПК** (из папки проекта, где есть `backend/` и `frontend/`):

```bash
# Соберите проект локально один раз
npm run build

# Залейте на VPS (подставьте user и IP)
rsync -avz --exclude node_modules --exclude backend/node_modules --exclude frontend/node_modules --exclude .git --exclude backend/.env \
  ./ user@VPS_IP:/opt/cryptosignal/
```

Или упакуйте и залейте архивом:

```bash
# На ПК: архив без node_modules и .env
tar --exclude=node_modules --exclude=backend/node_modules --exclude=frontend/node_modules --exclude=.git --exclude=backend/.env -czvf cryptosignal.tar.gz .

# Копируйте cryptosignal.tar.gz на VPS (scp, WinSCP и т.д.)
scp cryptosignal.tar.gz user@VPS_IP:/opt/

# На VPS:
cd /opt && tar -xzvf cryptosignal.tar.gz -C cryptosignal
```

---

## 4. Сборка и зависимости на VPS

На **VPS** в корне проекта:

```bash
cd /opt/cryptosignal

# Зависимости backend
cd backend && npm ci --omit=dev
# или если нет package-lock: npm install --omit=dev

# Зависимости frontend (нужны для сборки)
cd ../frontend && npm ci
# или: npm install

# Сборка backend и frontend из корня
cd /opt/cryptosignal
npm run build
```

Если загружали уже собранный `backend/dist` и `frontend/dist`, то `npm run build` можно выполнить только на VPS (нужны dev-зависимости в frontend для сборки). Для минимального деплоя без сборки на VPS можно залить уже готовые `backend/dist` и `frontend/dist` и поставить в backend только production-зависимости:

```bash
cd /opt/cryptosignal/backend
npm ci --omit=dev
# Сборка только backend, если frontend/dist уже залит
npm run build
```

---

## 5. Файл .env на VPS

Создайте **только на VPS**, не коммитьте в git:

```bash
nano /opt/cryptosignal/backend/.env
```

Минимально заполните (подставьте свои значения):

```env
# OKX — добавьте IP VPS в разрешённые на OKX
OKX_API_KEY=ваш_ключ
OKX_SECRET=ваш_секрет
OKX_PASSPHRASE=ваш_пассфраза

# Прокси (если нужны): список через запятую
PROXY_LIST=http://user:pass@ip1:port,http://user:pass@ip2:port

# Порт приложения (внутри сервера)
PORT=3000

# Продакшен
NODE_ENV=production

# Пароль админ-панели
ADMIN_PASSWORD=ваш_надёжный_пароль

# (опционально) Авто-торговля и тестнет
# AUTO_TRADING_EXECUTION_ENABLED=0
# OKX_SANDBOX=1
```

Сохраните (Ctrl+O, Enter, Ctrl+X).

---

## 6. Запуск приложения

### Вариант A: через PM2 (рекомендуется)

Запуск из **корня проекта**, чтобы backend видел `frontend/dist`:

```bash
cd /opt/cryptosignal
NODE_ENV=production PORT=3000 pm2 start backend/dist/index.js --name cryptosignal
pm2 save
pm2 startup
```

Или с ecosystem-файлом (в корне репозитория есть `ecosystem.config.js`):

```bash
cd /opt/cryptosignal
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

Проверка:

```bash
pm2 status
pm2 logs cryptosignal
curl -s http://127.0.0.1:3000/api/health
```

### Вариант B: без PM2 (для проверки)

```bash
cd /opt/cryptosignal
PORT=3000 NODE_ENV=production node backend/dist/index.js
```

Сервер будет слушать на `0.0.0.0:3000` (доступ снаружи по IP:3000).

---

## 7. Доступ по IP и порт 80 (Nginx)

Чтобы заходить по домену **http://cryptosignalpro.titanrust.ru** (и по IP) без порта:

```bash
sudo nano /etc/nginx/sites-available/cryptosignal
```

Вставьте (домен уже указан; при необходимости добавьте IP в `server_name`):

```nginx
server {
    listen 80;
    server_name cryptosignalpro.titanrust.ru;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Включите сайт и перезапустите Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/cryptosignal /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Откройте в браузере: **http://cryptosignalpro.titanrust.ru**.  
Для HTTPS (SSL) через Let's Encrypt:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cryptosignalpro.titanrust.ru
```

После этого сайт будет доступен по **https://cryptosignalpro.titanrust.ru**.

---

## 8. Файрвол

Разрешите HTTP и SSH:

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Если не используете Nginx и заходите по порту 3000:

```bash
sudo ufw allow 3000
```

---

## 9. Краткая шпаргалка команд

| Действие | Команды |
|----------|--------|
| Первый деплой | Клонировать/залить проект → `cd backend && npm ci --omit=dev` → `cd ../frontend && npm ci` → из корня `npm run build` → создать `backend/.env` → `pm2 start ecosystem.config.js --env production` |
| Обновление кода | `git pull` (или залить заново) → `npm run build` → `pm2 restart cryptosignal` |
| Логи | `pm2 logs cryptosignal` |
| Статус | `pm2 status` |
| Остановка | `pm2 stop cryptosignal` |

**Доступ после настройки Nginx:** http://cryptosignalpro.titanrust.ru (или https после `certbot --nginx -d cryptosignalpro.titanrust.ru`).

---

## 10. OKX и прокси

- В настройках API ключей OKX добавьте **IP вашего VPS** в список разрешённых.
- Прокси задаются в `backend/.env`: `PROXY_LIST=http://user:pass@ip:port,...` — они используются для запросов к OKX при необходимости.

После выполнения шагов приложение будет доступно по **http://cryptosignalpro.titanrust.ru** (и по **https://cryptosignalpro.titanrust.ru** после настройки SSL) для входа, регистрации и тестирования.
