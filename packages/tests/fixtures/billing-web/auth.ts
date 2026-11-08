import { useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
export const currentUser = () => sessionStorage.getItem("fixture-user");
export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function useAuthToken() {
  const user = useSyncExternalStore(subscribe, currentUser);
  return user ? `x.${btoa(JSON.stringify({ sub: user }))}.x` : null;
}
export function useAuthActions() {
  return {
    setSession: async ({ userId }: { userId: string }) => {
      sessionStorage.setItem("fixture-user", userId);
      listeners.forEach((fn) => fn());
    },
  };
}
