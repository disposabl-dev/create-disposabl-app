import { app, autoUpdater, BrowserWindow, dialog, Menu } from 'electron';
import { createUpdateController, feedUrl, type UpdateState } from './updates';
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
  const supported =
    process.platform === 'darwin' || process.platform === 'win32';
  const feed = app.isPackaged
    ? feedUrl(
        DISPOSABL_UPDATE_URL,
        DISPOSABL_UPDATE_CHANNEL,
        process.platform,
        process.arch,
      )
    : '';
  let state: UpdateState = 'idle';
  const renderMenu = () => {
    const labels = {
      idle: 'Check for updates…',
      checking: 'Checking for updates…',
      downloading: 'Downloading update…',
      ready: 'Restart to update…',
    };
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { label: labels[state], click: updates.check },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
      ]),
    );
  };
  const updates = createUpdateController({
    onState: (next) => {
      state = next;
      renderMenu();
    },
    supported,
    feed,
    readyAt:
      process.platform === 'win32' &&
      process.argv.includes('--squirrel-firstrun')
        ? Date.now() + 10_000
        : 0,
    start: () => {
      autoUpdater.setFeedURL(
        process.platform === 'darwin'
          ? { url: `${feed}/RELEASES.json`, serverType: 'json' }
          : { url: feed },
      );
      autoUpdater.checkForUpdates();
    },
    install: () => autoUpdater.quitAndInstall(),
    show: (type, message, detail) => {
      void dialog.showMessageBox({ type, message, detail });
    },
    confirmRestart: async () =>
      (
        await dialog.showMessageBox({
          type: 'info',
          message: 'Update downloaded',
          detail:
            'Restart to install the update. It may also be installed the next time you open the app.',
          buttons: ['Restart', 'Later'],
          defaultId: 0,
          cancelId: 1,
        })
      ).response === 0,
  });
  if (supported) {
    autoUpdater.on('update-available', updates.available);
    autoUpdater.on('update-not-available', updates.unavailable);
    autoUpdater.on('update-downloaded', updates.downloaded);
    autoUpdater.on('error', updates.error);
  }
  renderMenu();
  void createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
