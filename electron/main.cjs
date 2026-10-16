// Обёртка Electron: открывает собранную игру (dist/index.html) в окне ПК-приложения.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    backgroundColor: '#050508',
    title: 'BLACK ICE',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // F11 — полноэкранный режим
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
