import { requireOptionalNativeModule } from "expo";

type Observer = {
  addListener: (event: string, callback: () => void) => { remove: () => void };
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
};

/** Subscribe before reading eligibility. Missing native support fails closed. */
export function observeStorefront(onChange: () => void) {
  let removed = false;
  let listener: { remove: () => void } | undefined;
  let native: Observer | null = null;
  try {
    native = requireOptionalNativeModule<Observer>("StorefrontObserver");
    if (native) listener = native.addListener("onStorefrontChange", onChange);
  } catch {
    native = null;
  }
  const active = native;
  const ready =
    active && listener
      ? Promise.resolve()
          .then(() => active.start())
          .then(async (started) => {
            if (started && removed) await active.stop().catch(() => undefined);
            return started && !removed;
          })
          .catch(() => false)
      : Promise.resolve(false);
  return {
    ready,
    remove() {
      if (removed) return;
      removed = true;
      listener?.remove();
      void ready.then((started) => {
        if (started) void active?.stop().catch(() => undefined);
      });
    },
  };
}
