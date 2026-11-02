import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

if (started) app.quit();

async function createWindow() {
  const window = new BrowserWindow({
    title: 'Disposabl',
    width: 1000,
    height: 720,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Reuse the website's home, authentication and feature selection in the desktop app.
  const website = app.isPackaged ? DISPOSABL_WEB_URL : 'http://localhost:3000';
  if (website) {
    const origin = new URL(website).origin;
    if (app.isPackaged && !website.startsWith('https://'))
      throw new Error('Desktop requires an HTTPS website.');
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== origin) event.preventDefault();
    });
    try {
      await window.loadURL(website);
      return;
    } catch {
      /* Show the starter home if the website is unavailable. */
    }
  }
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else
    await window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
}

app.whenReady().then(() => {
  void createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
