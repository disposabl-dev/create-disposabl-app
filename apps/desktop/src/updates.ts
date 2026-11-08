export type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready';

export function feedUrl(
  base: string,
  channel: string,
  platform: string,
  arch: string,
) {
  if (!base || !/^[a-z0-9][a-z0-9-]*$/.test(channel)) return '';
  try {
    const url = new URL(base);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return '';
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${channel}/${platform}/${arch}`;
    return url.toString();
  } catch {
    return '';
  }
}

export function createUpdateController(options: {
  supported: boolean;
  feed: string;
  readyAt?: number;
  now?: () => number;
  start: () => void;
  install: () => void | Promise<void>;
  show: (kind: 'info' | 'error', message: string, detail?: string) => void;
  confirmRestart: () => Promise<boolean>;
  onState?: (state: UpdateState) => void;
}) {
  let state: UpdateState = 'idle';
  let confirming = false;
  const setState = (next: UpdateState) => {
    state = next;
    options.onState?.(next);
  };
  const restartError = () =>
    options.show(
      'error',
      'Could not restart to install the update.',
      'Your update is still downloaded. Try Restart to update again.',
    );
  const restart = async () => {
    if (state !== 'ready' || confirming) return;
    confirming = true;
    try {
      if (await options.confirmRestart()) await options.install();
    } catch {
      restartError();
    } finally {
      confirming = false;
    }
  };
  return {
    get state() {
      return state;
    },
    check() {
      if (!options.supported)
        return options.show(
          'info',
          'Automatic updates are unavailable for this build.',
          'Download the latest installer from the app’s download page.',
        );
      if (!options.feed)
        return options.show(
          'error',
          'Updates are not configured for this build.',
        );
      if ((options.now ?? Date.now)() < (options.readyAt ?? 0))
        return options.show(
          'info',
          'Finishing installation. Try checking for updates in a few seconds.',
        );
      if (state === 'ready') {
        void restart();
        return;
      }
      if (state !== 'idle')
        return options.show('info', 'An update check is already in progress.');
      setState('checking');
      try {
        options.start();
      } catch {
        setState('idle');
        options.show(
          'error',
          'Could not check for updates.',
          'Please try again later.',
        );
      }
    },
    available() {
      if (state === 'checking') setState('downloading');
    },
    unavailable() {
      if (state !== 'checking') return;
      setState('idle');
      options.show('info', 'This app is up to date.');
    },
    downloaded() {
      if (state !== 'checking' && state !== 'downloading') return;
      setState('ready');
      void restart();
    },
    error() {
      if (state === 'ready') return restartError();
      setState('idle');
      options.show(
        'error',
        'Could not check for updates.',
        'Check your connection and try again.',
      );
    },
  };
}
