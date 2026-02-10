#!/bin/bash
# CLABX — скрипт автоматического обновления на VPS
#
# Использование:
#   ./update.sh                    # Обновление с текущей ветки
#   ./update.sh main               # Обновление с конкретной ветки
#   ./update.sh --no-restart       # Обновление без перезапуска
#   ./update.sh --force            # Принудительное обновление (git reset --hard)

set -e  # Остановка при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${BLUE}[CLABX][update]${NC} $*"; }
success() { echo -e "${GREEN}[CLABX][update]${NC} $*"; }
warn() { echo -e "${YELLOW}[CLABX][update][WARN]${NC} $*"; }
err() { echo -e "${RED}[CLABX][update][ERROR]${NC} $*" >&2; }

# Параметры
BRANCH="${1:-main}"
NO_RESTART=false
FORCE_UPDATE=false
SERVICE_NAME="clabx"

# Обработка флагов
for arg in "$@"; do
  case $arg in
    --no-restart)
      NO_RESTART=true
      shift
      ;;
    --force)
      FORCE_UPDATE=true
      shift
      ;;
    --help|-h)
      echo "CLABX Update Script"
      echo ""
      echo "Usage:"
      echo "  ./update.sh [branch] [options]"
      echo ""
      echo "Options:"
      echo "  --no-restart    Обновить без перезапуска сервиса"
      echo "  --force         Принудительное обновление (git reset --hard)"
      echo "  --help, -h      Показать эту справку"
      echo ""
      echo "Examples:"
      echo "  ./update.sh                 # Обновить с main и перезапустить"
      echo "  ./update.sh dev             # Обновить с ветки dev"
      echo "  ./update.sh --force         # Принудительное обновление"
      echo "  ./update.sh --no-restart    # Обновить без перезапуска"
      exit 0
      ;;
  esac
done

# Проверка что мы в правильной директории
if [ ! -f "package.json" ]; then
  err "Ошибка: package.json не найден. Запустите скрипт из корня проекта."
  exit 1
fi

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  🚀 CLABX Automatic Update Script"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Сохраняем текущий коммит для отката
CURRENT_COMMIT=$(git rev-parse HEAD)
log "Текущий коммит: ${CURRENT_COMMIT:0:8}"

# Проверяем статус git
if [ -n "$(git status --porcelain)" ]; then
  warn "Обнаружены незакоммиченные изменения:"
  git status --short
  echo ""

  if [ "$FORCE_UPDATE" = true ]; then
    warn "Флаг --force: сбрасываем все изменения..."
    git reset --hard
    git clean -fd
  else
    read -p "Продолжить обновление? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      warn "Обновление отменено"
      exit 0
    fi
  fi
fi

# Останавливаем сервис
if [ "$NO_RESTART" = false ]; then
  log "Останавливаем сервис ${SERVICE_NAME}..."
  if systemctl is-active --quiet $SERVICE_NAME; then
    sudo systemctl stop $SERVICE_NAME
    success "Сервис остановлен"
  else
    warn "Сервис ${SERVICE_NAME} не запущен"
  fi
fi

# Создаем backup базы данных (если есть)
if [ -d "data" ]; then
  log "Создаём backup базы данных..."
  BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
  mkdir -p "$BACKUP_DIR"
  cp -r data "$BACKUP_DIR/"
  success "Backup создан: $BACKUP_DIR"
fi

# Git pull
log "Получаем обновления из репозитория (ветка: ${BRANCH})..."
git fetch origin

if [ "$FORCE_UPDATE" = true ]; then
  git reset --hard origin/$BRANCH
else
  git pull origin $BRANCH
fi

NEW_COMMIT=$(git rev-parse HEAD)
log "Новый коммит: ${NEW_COMMIT:0:8}"

if [ "$CURRENT_COMMIT" = "$NEW_COMMIT" ]; then
  success "Уже установлена последняя версия"

  if [ "$NO_RESTART" = false ]; then
    log "Перезапускаем сервис..."
    sudo systemctl start $SERVICE_NAME
    success "Сервис запущен"
  fi

  exit 0
fi

# Показываем что изменилось
log "Изменения:"
git log --oneline $CURRENT_COMMIT..$NEW_COMMIT

# Функция отката
rollback() {
  err "Обновление не удалось! Откатываемся к $CURRENT_COMMIT..."
  git reset --hard $CURRENT_COMMIT

  if [ -d "$BACKUP_DIR" ]; then
    log "Восстанавливаем backup базы данных..."
    cp -r "$BACKUP_DIR/data" ./
  fi

  if [ "$NO_RESTART" = false ]; then
    log "Запускаем сервис..."
    sudo systemctl start $SERVICE_NAME
  fi

  err "Откат завершён"
  exit 1
}

# Устанавливаем trap для отката при ошибке
trap rollback ERR

# Устанавливаем зависимости и собираем проект
log "Устанавливаем зависимости..."
npm install

log "Собираем backend..."
cd backend
npm install
npm run build
cd ..

log "Собираем frontend..."
cd frontend
npm install
npm run build
cd ..

# Применяем миграции БД (если есть)
if [ -f "backend/dist/migrations.js" ]; then
  log "Применяем миграции базы данных..."
  node backend/dist/migrations.js || warn "Миграции не применились (возможно их нет)"
fi

# Удаляем trap
trap - ERR

# Запускаем сервис
if [ "$NO_RESTART" = false ]; then
  log "Запускаем сервис ${SERVICE_NAME}..."
  sudo systemctl start $SERVICE_NAME

  # Ждем несколько секунд и проверяем статус
  sleep 3

  if systemctl is-active --quiet $SERVICE_NAME; then
    success "✅ Сервис успешно запущен"
  else
    err "❌ Сервис не запустился! Проверьте логи:"
    echo "  journalctl -u ${SERVICE_NAME} -n 50"
    exit 1
  fi
fi

# Очистка старых backups (оставляем только последние 5)
if [ -d "backups" ]; then
  log "Очистка старых backups..."
  ls -t backups | tail -n +6 | xargs -I {} rm -rf backups/{}
fi

success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
success "  ✅ Обновление завершено успешно!"
success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Изменения:"
echo "  От:  ${CURRENT_COMMIT:0:8}"
echo "  До:  ${NEW_COMMIT:0:8}"
echo ""
echo "Полезные команды:"
echo "  systemctl status ${SERVICE_NAME}    # Статус сервиса"
echo "  journalctl -u ${SERVICE_NAME} -f    # Логи в реальном времени"
echo "  git log --oneline -5                # Последние коммиты"
echo ""

# Показываем версию (если есть package.json с версией)
if command -v jq &> /dev/null && [ -f "package.json" ]; then
  VERSION=$(jq -r '.version // "unknown"' package.json)
  success "Текущая версия: v${VERSION}"
fi
