#!/bin/bash
# CryptoSignal Pro — автоматическая установка на VPS (Ubuntu 24.04)
# Запуск: загрузите проект на VPS, затем: chmod +x install.sh && sudo ./install.sh

set -e

DOMAIN="cryptosignalpro.titanrust.ru"
APP_PORT="3000"
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
export NODE_ENV=production
export PORT="$APP_PORT"

log() { echo "[CryptoSignal] $*"; }
err() { echo "[CryptoSignal ERROR] $*" >&2; }

# Проверка: root или sudo
if [ "$(id -u)" -ne 0 ]; then
  err "Запустите скрипт с sudo: sudo ./install.sh"
  exit 1
fi

log "Корень проекта: $PROJECT_ROOT"
if [ ! -f "$PROJECT_ROOT/package.json" ] || [ ! -d "$PROJECT_ROOT/backend" ]; then
  err "Не найден корень проекта (package.json, backend/). Запускайте install.sh из корня репозитория."
  exit 1
fi

# 1. Обновление системы
log "Обновление системы..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

# 2. Node.js 20
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  log "Установка Node.js 20..."
  apt-get install -y -qq curl
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -s -- -qq
  apt-get install -y -qq nodejs
fi
log "Node: $(node -v) npm: $(npm -v)"

# 3. PM2
if ! command -v pm2 &>/dev/null; then
  log "Установка PM2..."
  npm install -g pm2 --silent
fi
log "PM2: $(pm2 -v)"

# 4. Зависимости и сборка приложения (от имени пользователя, чтобы владельцем был не root)
RUN_USER="${SUDO_USER:-root}"
log "Установка зависимостей и сборка (пользователь: $RUN_USER)..."
cd "$PROJECT_ROOT"
chown -R "$RUN_USER:$RUN_USER" . 2>/dev/null || true

if [ -f backend/package-lock.json ]; then
  sudo -u "$RUN_USER" sh -c "cd $PROJECT_ROOT/backend && npm ci --omit=dev"
else
  sudo -u "$RUN_USER" sh -c "cd $PROJECT_ROOT/backend && npm install --omit=dev"
fi

if [ -f frontend/package-lock.json ]; then
  sudo -u "$RUN_USER" sh -c "cd $PROJECT_ROOT/frontend && npm ci"
else
  sudo -u "$RUN_USER" sh -c "cd $PROJECT_ROOT/frontend && npm install"
fi

sudo -u "$RUN_USER" sh -c "cd $PROJECT_ROOT && npm run build"

# 5. .env
if [ ! -f backend/.env ]; then
  log "Создание backend/.env из .env.example..."
  if [ -f backend/.env.example ]; then
    cp backend/.env.example backend/.env
    sed -i "s/^NODE_ENV=.*/NODE_ENV=production/" backend/.env
    sed -i "s/^PORT=.*/PORT=$APP_PORT/" backend/.env
    chown "$RUN_USER:$RUN_USER" backend/.env 2>/dev/null || true
    log "Отредактируйте backend/.env: OKX ключи, PROXY_LIST, ADMIN_PASSWORD"
  else
    echo "PORT=$APP_PORT" > backend/.env
    echo "NODE_ENV=production" >> backend/.env
    chown "$RUN_USER:$RUN_USER" backend/.env 2>/dev/null || true
  fi
else
  log "backend/.env уже существует, не трогаем"
fi

# 6. Nginx
log "Настройка Nginx для $DOMAIN..."
apt-get install -y -qq nginx
NGINX_CONF="/etc/nginx/sites-available/cryptosignal"
cat > "$NGINX_CONF" << 'NGINX_EOF'
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
NGINX_EOF
sed -i "s/cryptosignalpro.titanrust.ru/$DOMAIN/" "$NGINX_CONF"
sed -i "s/127.0.0.1:3000/127.0.0.1:$APP_PORT/" "$NGINX_CONF"

if [ ! -L /etc/nginx/sites-enabled/cryptosignal ]; then
  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/cryptosignal
fi
nginx -t && systemctl reload nginx
log "Nginx: конфиг создан и перезагружен"

# 7. PM2: запуск приложения
log "Запуск приложения через PM2..."
cd "$PROJECT_ROOT"
sudo -u "$RUN_USER" env NODE_ENV=production PORT="$APP_PORT" pm2 delete cryptosignal 2>/dev/null || true
sudo -u "$RUN_USER" sh -c "cd $PROJECT_ROOT && NODE_ENV=production PORT=$APP_PORT pm2 start ecosystem.config.js --env production"
sudo -u "$RUN_USER" pm2 save
sudo -u "$RUN_USER" pm2 startup systemd -u "$RUN_USER" --hp "$(eval echo ~$RUN_USER)" 2>/dev/null || true

# 8. Итог
log "Проверка здоровья API..."
sleep 2
if curl -sf "http://127.0.0.1:$APP_PORT/api/health" >/dev/null; then
  log "API отвечает на порту $APP_PORT"
else
  err "API пока не ответил. Проверьте: pm2 logs cryptosignal"
fi

echo ""
log "Установка завершена."
echo "  Сайт:    http://$DOMAIN"
echo "  Логи:    pm2 logs cryptosignal"
echo "  Статус:  pm2 status"
echo "  .env:    отредактируйте $PROJECT_ROOT/backend/.env (OKX, прокси, пароль админки)"
echo ""
echo "  HTTPS (опционально): sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d $DOMAIN"
echo ""
