import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
import { currentUser, subscribe } from "./auth";
async function call(name: string, args: unknown) {
  const response = await fetch("http://127.0.0.1:3451/call", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, args, user: currentUser() }),
  });
  if (!response.ok) throw new Error("Fixture request failed");
  return response.json();
}
export function useConvexAuth() {
  const user = useSyncExternalStore(subscribe, currentUser);
  return { isAuthenticated: !!user, isLoading: false };
}
export function useAction(ref: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(ref);
  return useCallback((args: unknown) => call(name, args), [name]);
}
export const useMutation = useAction;
export function useQuery(
  ref: Parameters<typeof getFunctionName>[0],
  args: { code: string } | "skip",
) {
  const [value, setValue] = useState<unknown>(undefined);
  const code = args === "skip" ? null : args.code;
  useEffect(() => {
    if (code) void call(getFunctionName(ref), { code }).then(setValue);
  }, [ref, code]);
  return value;
}
