#!/bin/bash
# CryptoSignal Pro — отдельная настройка домена (Nginx reverse proxy) под Debian 12 / Ubuntu
#
# Примеры:
#   sudo ./domain.sh cryptosignalpro.titanrust.ru 3000
#   sudo ./domain.sh cryptosignalpro.titanrust.ru 3000 --ssl admin@example.com
#
# Переменные окружения (альтернатива аргументам):
#   DOMAIN   — домен
#   APP_PORT — порт приложения (по умолчанию 3000)
#   SSL=1    — включить HTTPS через Let's Encrypt
#   EMAIL    — e-mail для Let's Encrypt

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

log() { echo "[CryptoSignal][domain] $*"; }
err() { echo "[CryptoSignal][domain][ERROR] $*" >&2; }

if [ "$(id -u)" -ne 0 ]; then
  err "Запустите скрипт от root: sudo ./domain.sh <domain> [port] [--ssl email]"
  exit 1
fi

DOMAIN="${DOMAIN:-${1:-}}"
APP_PORT="${APP_PORT:-${2:-3000}}"
SSL="${SSL:-0}"
EMAIL="${EMAIL:-}"

MODE_SSL_ARG="${3:-}"
EMAIL_ARG="${4:-}"

if [ "$MODE_SSL_ARG" = "--ssl" ]; then
  SSL="1"
  [ -n "$EMAIL_ARG" ] && EMAIL="$EMAIL_ARG"
fi

if [ -z "$DOMAIN" ]; then
  err "Не указан домен."
  echo "Usage:"
  echo "  sudo $0 cryptosignalpro.titanrust.ru 3000"
  echo "  sudo $0 cryptosignalpro.titanrust.ru 3000 --ssl admin@example.com"
  exit 1
fi

if ! [[ "$APP_PORT" =~ ^[0-9]+$ ]] || [ "$APP_PORT" -lt 1 ] || [ "$APP_PORT" -gt 65535 ]; then
  err "Некорректный порт: $APP_PORT"
  exit 1
fi

SITE_ID="$(echo "$DOMAIN" | tr -cs 'A-Za-z0-9' '_' | tr '[:upper:]' '[:lower:]')"
NGINX_CONF="/etc/nginx/sites-available/${SITE_ID}"

log "Установка/проверка Nginx..."
apt-get update -qq
apt-get install -y -qq nginx ca-certificates

log "Отключаю дефолтный сайт (если есть)..."
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

log "Создаю конфиг Nginx: $NGINX_CONF (domain=$DOMAIN, port=$APP_PORT)..."
cat > "$NGINX_CONF" <<'NGINX_EOF'
server {
    listen 80;
    server_name __DOMAIN__;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:__PORT__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
NGINX_EOF

sed -i "s/__DOMAIN__/${DOMAIN}/g" "$NGINX_CONF"
sed -i "s/__PORT__/${APP_PORT}/g" "$NGINX_CONF"

ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${SITE_ID}"

log "Проверяю конфигурацию Nginx..."
nginx -t
systemctl reload nginx

if [ "$SSL" = "1" ]; then
  if [ -z "$EMAIL" ]; then
    err "Для --ssl обязателен email: sudo $0 $DOMAIN $APP_PORT --ssl admin@example.com"
    exit 1
  fi
  log "Установка Certbot и выпуск HTTPS сертификата для $DOMAIN..."
  apt-get install -y -qq certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --redirect
  log "HTTPS включён для $DOMAIN"
fi

log "Готово."
echo "  Домен:   http://$DOMAIN"
echo "  Порт:    $APP_PORT (проксируется на 127.0.0.1:$APP_PORT)"
echo "  Проверка: curl -I http://$DOMAIN"
echo "  Статус:  systemctl status nginx"

