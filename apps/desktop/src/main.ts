import { app, autoUpdater, BrowserWindow, dialog, Menu, shell } from 'electron';
import { createUpdateController, feedUrl, type UpdateState } from './updates';
import { protectNavigation } from './navigation';
import {
  desktopAuthCallback,
  desktopAuthScheme,
} from '../../../packages/disposabl-kit/lib/desktop-auth';
import path from 'node:path';
import started from 'electron-squirrel-startup';

if (DISPOSABL_DESKTOP_ID)
  app.setPath(
    'userData',
    path.join(app.getPath('appData'), `disposabl-${DISPOSABL_DESKTOP_ID}`),
  );

if (started) app.quit();

const website =
  DISPOSABL_WEB_URL || (app.isPackaged ? '' : 'http://localhost:3000');
const authScheme = desktopAuthScheme(DISPOSABL_DESKTOP_ID);
let mainWindow: BrowserWindow | undefined;
let pendingAuth: string | undefined;
function receiveAuth(url: string) {
  if (!desktopAuthCallback(url, DISPOSABL_DESKTOP_ID, website)) return;
  pendingAuth = url;
  finishAuth();
}
function finishAuth() {
  if (
    !pendingAuth ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    mainWindow.webContents.isLoading()
  )
    return;
  const current = mainWindow.webContents.getURL();
  const destination =
    current && new URL(current).origin === new URL(website).origin
      ? current
      : website;
  const target = desktopAuthCallback(
    pendingAuth,
    DISPOSABL_DESKTOP_ID,
    destination,
  );
  pendingAuth = undefined;
  if (!target) return;
  mainWindow.show();
  mainWindow.focus();
  void mainWindow.loadURL(target).catch(() => {
    void dialog.showMessageBox({
      type: 'error',
      message: 'Could not return to sign-in. Please try again.',
    });
  });
}
if (authScheme) {
  if (!app.requestSingleInstanceLock()) app.exit(0);
  // Packaged protocol metadata and Windows registration use this app's unique identity.
  if (app.isPackaged) app.setAsDefaultProtocolClient(authScheme);
  app.on('open-url', (event, url) => {
    event.preventDefault();
    receiveAuth(url);
  });
  app.on('second-instance', (_event, args) => {
    for (const arg of args)
      if (arg.startsWith(`${authScheme}://`)) receiveAuth(arg);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  for (const arg of process.argv)
    if (arg.startsWith(`${authScheme}://`)) receiveAuth(arg);
}

async function createWindow() {
  const window = new BrowserWindow({
    title: app.name,
    width: 1000,
    height: 720,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: authScheme ? ['--disposabl-desktop-auth'] : [],
    },
  });
  mainWindow = window;
  window.webContents.on('did-stop-loading', finishAuth);
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  // Reuse the website's home, authentication and feature selection in the desktop app.
  if (website) {
    const origin = new URL(website).origin;
    if (app.isPackaged && !website.startsWith('https://'))
      throw new Error('Desktop requires an HTTPS website.');
    protectNavigation(
      window.webContents,
      origin,
      (url) => shell.openExternal(url),
      () => {
        if (window.isDestroyed()) return;
        void dialog.showMessageBox(window, {
          type: 'error',
          message: 'Could not open your browser. Please try again.',
        });
      },
    );
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
