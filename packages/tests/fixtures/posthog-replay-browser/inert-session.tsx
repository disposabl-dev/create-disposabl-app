import { useSyncExternalStore, type ReactNode } from "react";

const event = "fixture-auth-change";
const subscribe = (notify: () => void) => {
  window.addEventListener(event, notify);
  return () => window.removeEventListener(event, notify);
};
export function useSession() {
  return useSyncExternalStore(
    subscribe,
    () => localStorage.getItem("fixture-session") || "",
    () => "",
  );
}
export function setSession(value: string) {
  localStorage.setItem("fixture-session", value);
  window.dispatchEvent(new Event(event));
}
export function ConvexAuthProvider({ children }: { children: ReactNode }) {
  return children;
}
export function useAuthToken() {
  const session = useSession();
  return session ? `x.${btoa(JSON.stringify({ sub: session }))}.x` : null;
}
export function useAuthActions() {
  return {
    signOut: async () => setSession(""),
    signIn: async () => ({ status: "error" }),
  };
}
const method = () => ({
  pending: false,
  signIn: async () => ({ status: "error" }),
  signUp: async () => ({ status: "error" }),
  complete: async () => ({ status: "error" }),
  start: async () => ({ status: "error" }),
});
export const useSignInWithUsernamePassword = method;
export const useSignUpWithUsernamePassword = method;
export const useSignInWithEmailPassword = method;
export const useSignUpWithEmailPassword = method;
export const useCompleteSignUp = method;
export const useStartPasswordRecovery = method;
export const useCompletePasswordRecovery = method;
export const useSignInWithGoogle = method;
export const useOauth = () => ({ flowError: null });
