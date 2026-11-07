import type { WebContents } from 'electron';

export function externalUrl(input: string) {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Keep remote content outside the app's privileged window and preload. */
export function protectNavigation(
  contents: WebContents,
  origin: string,
  openExternal: (url: string) => Promise<void>,
  onError: () => void,
  closePopup?: () => void,
) {
  const sameOrigin = (input: string) => {
    try {
      return new URL(input).origin === origin;
    } catch {
      return false;
    }
  };
  const open = (input: string) => {
    const url = externalUrl(input);
    if (!url) return;
    void openExternal(url).then(
      () => closePopup?.(),
      () => {
        closePopup?.();
        onError();
      },
    );
  };
  const navigate = (event: { preventDefault(): void }, url: string) => {
    if (sameOrigin(url)) return;
    event.preventDefault();
    open(url);
  };
  contents.on('will-navigate', navigate);
  contents.on('will-redirect', navigate);
  contents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || sameOrigin(url))
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: url !== 'about:blank',
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      };
    open(url);
    return { action: 'deny' };
  });
  contents.on('did-create-window', (child) => {
    child.webContents.session.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    protectNavigation(child.webContents, origin, openExternal, onError, () =>
      child.close(),
    );
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}
