#!/bin/bash
# CryptoSignal Pro — авто‑установка под Debian 12 (и Ubuntu 22+/24+)
# Клонирование/обновление репозитория, установка Node.js, PM2, сборка и запуск.
#
# Запуск (рекомендуемый):
#   sudo ./install.sh /root/opt/cryptosignal
#
# Переменные окружения (опционально):
#   GIT_REPO   — URL репозитория (по умолчанию GitHub проекта)
#   APP_PORT   — порт приложения (по умолчанию 3000)
#   PROJECT_DIR — каталог установки, если не передаётся аргументом

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
export NPM_CONFIG_YES=true

GIT_REPO="${GIT_REPO:-https://github.com/KlachoW666/GavnoshkaImpalustiankasd.git}"
APP_PORT="${APP_PORT:-3000}"
INSTALL_DIR="${1:-${PROJECT_DIR:-/root/opt/cryptosignal}}"

log() { echo "[CryptoSignal][install] $*"; }
err() { echo "[CryptoSignal][install][ERROR] $*" >&2; }

if [ "$(id -u)" -ne 0 ]; then
  err "Запустите скрипт от root: sudo ./install.sh /root/opt/cryptosignal"
  exit 1
fi

RUN_USER="${SUDO_USER:-root}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"

# Абсолютный путь для INSTALL_DIR
if [ "${INSTALL_DIR#/}" = "$INSTALL_DIR" ]; then
  INSTALL_DIR="$(pwd)/$INSTALL_DIR"
fi

log "Целевой каталог установки: $INSTALL_DIR (пользователь: $RUN_USER)"

log "Обновление системы и установка базовых пакетов (git, curl, ca-certificates)..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq git curl ca-certificates

# Клонирование / обновление репозитория
log "Клонирование/обновление репозитория из $GIT_REPO..."
mkdir -p "$(dirname "$INSTALL_DIR")"
if [ -d "$INSTALL_DIR/.git" ]; then
  log "Репозиторий уже существует, выполняю git fetch/reset..."
  (cd "$INSTALL_DIR" && git fetch origin && git reset --hard origin/main)
elif [ -d "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
  log "Каталог существует и не пуст — временное клонирование и копирование файлов..."
  TMP_CLONE="$(mktemp -d)"
  git clone --depth 1 "$GIT_REPO" "$TMP_CLONE"
  cp -a "$TMP_CLONE"/. "$INSTALL_DIR"
  rm -rf "$TMP_CLONE"
else
  git clone --depth 1 "$GIT_REPO" "$INSTALL_DIR"
fi

PROJECT_ROOT="$INSTALL_DIR"
if [ ! -f "$PROJECT_ROOT/package.json" ] || [ ! -d "$PROJECT_ROOT/backend" ] || [ ! -d "$PROJECT_ROOT/frontend" ]; then
  err "После клонирования не найден корень проекта (package.json, backend/, frontend/). Проверьте репозиторий."
  exit 1
fi

chown -R "$RUN_USER:$RUN_USER" "$PROJECT_ROOT" 2>/dev/null || true
log "Корень проекта: $PROJECT_ROOT"

# Установка Node.js 20 под Debian 12 / Ubuntu
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  log "Установка Node.js 20 (через NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -s -- -y
  apt-get install -y -qq nodejs
fi
log "Node: $(node -v) npm: $(npm -v)"

# PM2
if ! command -v pm2 >/dev/null 2>&1; then
  log "Установка PM2 (глобально)..."
  npm install -g pm2 --silent
fi
log "PM2: $(pm2 -v)"

# Установка зависимостей и сборка
log "Установка зависимостей backend/frontend и сборка (это может занять 5–15 минут)..."
cd "$PROJECT_ROOT"
chown -R "$RUN_USER:$RUN_USER" . 2>/dev/null || true

log "Backend: чистая установка пакетов..."
cd "$PROJECT_ROOT/backend"
rm -rf node_modules package-lock.json
NODE_ENV=development NPM_CONFIG_YES=true npm install --include=dev --no-fund --no-audit

log "Frontend: чистая установка пакетов..."
cd "$PROJECT_ROOT/frontend"
rm -rf node_modules package-lock.json
NODE_ENV=development NPM_CONFIG_YES=true npm install --include=dev --no-fund --no-audit

log "Сборка backend и frontend через npm run build..."
cd "$PROJECT_ROOT"
npm run build

# backend/.env
cd "$PROJECT_ROOT"
if [ ! -f backend/.env ]; then
  log "Создание backend/.env из backend/.env.example (если есть)..."
  if [ -f backend/.env.example ]; then
    cp backend/.env.example backend/.env
  else
    touch backend/.env
  fi
  sed -i "s/^NODE_ENV=.*/NODE_ENV=production/" backend/.env 2>/dev/null || echo "NODE_ENV=production" >> backend/.env
  sed -i "s/^PORT=.*/PORT=$APP_PORT/" backend/.env 2>/dev/null || echo "PORT=$APP_PORT" >> backend/.env
  chown "$RUN_USER:$RUN_USER" backend/.env 2>/dev/null || true
fi

# PM2: запуск и автозапуск
log "Запуск приложения через PM2..."
pm2 delete cryptosignal 2>/dev/null || true
NODE_ENV=production PORT="$APP_PORT" pm2 start ecosystem.config.js --env production
pm2 save

log "Настройка systemd для автозапуска PM2..."
env PATH="$PATH" pm2 startup systemd -u "$RUN_USER" --hp "$RUN_HOME" >/dev/null 2>&1 || true

# Быстрая проверка API
log "Проверка API на http://127.0.0.1:$APP_PORT/api/health ..."
apt-get install -y -qq curl >/dev/null 2>&1 || true
for i in 1 2 3 4 5; do
  if curl -sf "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1; then
    log "API отвечает на порту $APP_PORT"
    break
  fi
  [ "$i" -eq 5 ] && err "API не ответил за 10 секунд. Проверьте: pm2 logs cryptosignal"
  sleep 2
done

echo
log "Установка завершена."
echo "  Порт API: http://127.0.0.1:$APP_PORT"
echo "  PM2:      pm2 status && pm2 logs cryptosignal"
echo "  .env:     $PROJECT_ROOT/backend/.env (OKX, прокси и т.д.)"
echo "  Домены и Nginx: запускайте отдельно скрипт domain.sh"
echo

