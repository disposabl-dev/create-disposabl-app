import { useEffect, useRef } from "react";

// A pending send owns its files until the server confirms success or failure.
export function useAttachmentLifecycle<T extends string>(
  remove: (id: T) => Promise<unknown>,
) {
  const state = useRef({
    generation: 0,
    mounted: false,
    owned: new Set<T>(),
    pending: new Set<T>(),
    sending: false,
  });
  const removeRef = useRef(remove);
  useEffect(() => {
    removeRef.current = remove;
  }, [remove]);
  useEffect(() => {
    const current = state.current;
    current.mounted = true;
    current.generation++;
    return () => {
      current.mounted = false;
      current.generation++;
      for (const id of current.owned) {
        if (!current.pending.has(id)) {
          current.owned.delete(id);
          void removeRef.current(id).catch(() => undefined);
        }
      }
    };
  }, []);

  function generation() {
    return state.current.generation;
  }
  function active(token: number) {
    return state.current.mounted && state.current.generation === token;
  }
  function uploaded(id: T, token: number) {
    if (!active(token)) {
      void remove(id).catch(() => undefined);
      return false;
    }
    state.current.owned.add(id);
    return true;
  }
  async function discard(id: T) {
    state.current.owned.delete(id);
    try {
      await remove(id);
    } catch (error) {
      if (state.current.mounted) state.current.owned.add(id);
      else void remove(id).catch(() => undefined);
      throw error;
    }
  }
  function beginSend(ids: T[]) {
    if (!state.current.mounted || state.current.sending) return false;
    state.current.sending = true;
    for (const id of ids) state.current.pending.add(id);
    return true;
  }
  function finishSend(ids: T[], sent: boolean, rejected = false) {
    state.current.sending = false;
    for (const id of ids) {
      state.current.pending.delete(id);
      // A rejected request after unmount can have an unknown server outcome.
      if (sent || !rejected || !state.current.mounted)
        state.current.owned.delete(id);
      if (!sent && rejected && !state.current.mounted)
        void removeRef.current(id).catch(() => undefined);
    }
  }
  return { generation, active, uploaded, discard, beginSend, finishSend };
}
