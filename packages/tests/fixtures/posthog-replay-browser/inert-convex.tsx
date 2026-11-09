import type { ReactNode } from "react";
import { getFunctionName } from "convex/server";
import { useSession } from "./inert-session";

export class ConvexReactClient {
  url: string;
  constructor(url: string) {
    this.url = url;
  }
}
export function ConvexProvider({ children }: { children: ReactNode }) {
  return children;
}
export function useConvex() {
  return { url: "https://fixture.invalid" };
}
export function useConvexAuth() {
  return { isAuthenticated: !!useSession(), isLoading: false };
}
export function Authenticated({ children }: { children: ReactNode }) {
  return useSession() ? children : null;
}
export function Unauthenticated({ children }: { children: ReactNode }) {
  return useSession() ? null : children;
}
export function AuthLoading() {
  return null;
}
export function useAction(reference: Parameters<typeof getFunctionName>[0]) {
  return async () =>
    getFunctionName(reference) === "mcp:createApiKey"
      ? { apiKey: "SECRET_KEY_MATERIAL_91" }
      : {};
}
export function useMutation() {
  return async () => ({});
}
export function useQuery(
  reference: Parameters<typeof getFunctionName>[0],
  args?: unknown,
) {
  const session = useSession();
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  if (name === "auth:providers")
    return {
      googleOnly: false,
      emailPassword: true,
      emailDelivery: true,
      google: false,
    };
  if (name === "auth:account")
    return { username: "SECRET_ACCOUNT_91", passwordMethod: true };
  if (name === "users/index:current") return { id: "SECRET_ACCOUNT_91" };
  if (name === "users/index:deletionStatus") return null;
  if (name === "mcp:getAuthRequest")
    return {
      status: "pending",
      kind: "device",
      userCode: "SECRET_DEVICE_CODE_91",
      clientName: "SECRET_CLIENT_91",
      serverName: "Disposabl",
      scopes: [],
    };
  if (name === "mcp:listConnections")
    return [
      {
        kind: "apiKey",
        id: "SECRET_KEY_ID_91",
        name: `SECRET_API_KEY_LABEL_${session}`,
      },
    ];
  if (name === "connections/index:status")
    return {
      github: true,
      convex: true,
      expo: false,
      posthog: false,
      available: {
        github: true,
        convex: true,
        expo: false,
        posthog: false,
        autumn: false,
      },
    };
  return null;
}
