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
  start: () => void;
  install: () => void;
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
  const restart = async () => {
    if (state !== 'ready' || confirming) return;
    confirming = true;
    try {
      if (await options.confirmRestart()) options.install();
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
          'Use your system package manager to update this app.',
          'Native in-app updates are supported on macOS and Windows only.',
        );
      if (!options.feed)
        return options.show(
          'error',
          'Updates are not configured for this build.',
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
      if (state === 'ready') return;
      setState('idle');
      options.show(
        'error',
        'Could not check for updates.',
        'Check your connection and try again.',
      );
    },
  };
}
