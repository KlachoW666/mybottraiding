const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow = null;

function showError(title, msg) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBox(mainWindow, { type: 'error', title, message: msg });
  } else {
    dialog.showMessageBoxSync({ type: 'error', title, message: msg });
  }
}

async function waitForBackend(maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
          res.on('data', () => {});
          res.on('end', () => resolve());
        });
        req.on('error', reject);
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return false;
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Экспорт сигналов', accelerator: 'CmdOrCtrl+E' },
        { label: 'Выход', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Отменить', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Повторить', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Настройки', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.executeJavaScript('window.__navigateTo && window.__navigateTo("settings")').catch(() => {}) }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: () => mainWindow?.webContents.executeJavaScript('window.__navigateTo && window.__navigateTo("dashboard")').catch(() => {}) },
        { label: 'Сигналы', accelerator: 'CmdOrCtrl+2', click: () => mainWindow?.webContents.executeJavaScript('window.__navigateTo && window.__navigateTo("signals")').catch(() => {}) },
        { label: 'График', accelerator: 'CmdOrCtrl+3', click: () => mainWindow?.webContents.executeJavaScript('window.__navigateTo && window.__navigateTo("chart")').catch(() => {}) },
        { label: 'Демо-торговля', accelerator: 'CmdOrCtrl+4', click: () => mainWindow?.webContents.executeJavaScript('window.__navigateTo && window.__navigateTo("demo")').catch(() => {}) },
        { type: 'separator' },
        { label: 'Полноэкранный режим', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Свернуть', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: 'Развернуть', role: 'zoom' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'О программе', role: 'about' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
let backendStarted = false;

async function startBackend() {
  if (backendStarted) return;
  backendStarted = true;
  const projectRoot = path.join(__dirname, '..');
  process.chdir(projectRoot);

  const backendPath = path.join(projectRoot, 'backend', 'dist', 'index.js');
  if (!fs.existsSync(backendPath)) {
    throw new Error(
      'Backend не собран.\n\nВыполните в корне проекта:\n  npm run build\n\nИли:\n  npm run build:backend\n  npm run build:frontend'
    );
  }

  try {
    const backend = require(backendPath);
    await backend.startServer(3000);
  } catch (err) {
    console.error('Backend start error:', err);
    throw new Error('Не удалось запустить backend: ' + (err?.message || String(err)));
  }
}

async function createWindow() {
  try {
    await startBackend();
    const ready = await waitForBackend();
    if (!ready) {
      showError('Ошибка запуска', 'Backend не ответил на проверку. Попробуйте перезапустить приложение.');
      return;
    }
  } catch (err) {
    const msg = err?.message || String(err);
    showError('Ошибка запуска', msg);
    console.error('Startup error:', err);
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'CryptoSignal Pro',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false
  });

  mainWindow.loadURL('http://localhost:3000').catch((err) => {
    console.error('Load error:', err);
    showError('Ошибка загрузки', 'Не удалось загрузить приложение. Проверьте, что frontend собран (npm run build:frontend).');
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools();
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      mainWindow?.webContents?.executeJavaScript('!!(document.getElementById("root") && !document.getElementById("root").innerHTML.trim())').catch(() => {}).then((rootEmpty) => {
        if (rootEmpty) mainWindow?.webContents?.openDevTools();
      });
    }, 2500);
  });
  mainWindow.webContents.on('did-fail-load', (_, code, desc) => {
    console.error('Page failed to load:', code, desc);
    if (code !== -3) showError('Ошибка загрузки страницы', `${code}: ${desc}`);
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  createMenu();
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  showError('Критическая ошибка', err?.message || String(err));
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

app.whenReady().then(() => createWindow()).catch((err) => {
  console.error('App ready error:', err);
  showError('Ошибка', err?.message || String(err));
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
