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
const convex = { url: "https://fixture.invalid" };
export function useConvex() {
  return convex;
}
export class ConvexHttpClient {
  setAuth() {}
  async query(reference: Parameters<typeof getFunctionName>[0]) {
    return getFunctionName(reference) === "auth:account"
      ? { username: "SECRET_ACCOUNT_91" }
      : { id: "SECRET_CUSTOMER_91" };
  }
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
const actions: Record<string, (...args: any[]) => Promise<unknown>> = {
  "mcp:createApiKey": async () => ({ apiKey: "SECRET_KEY_MATERIAL_91" }),
  "billing:snapshot": async () => ({
    balance: 424242,
    hasMonthlyPlan: false,
    checkoutNeedsReview: false,
    customerId: "SECRET_CUSTOMER_91",
  }),
  "billing:checkout": async ({ purchase }: { purchase: string }) => {
    (window as any).fixtureBillingCalls.push(purchase);
    return { url: null };
  },
  "billing:portal": async () => {
    (window as any).fixtureBillingCalls.push("portal");
    throw new Error("SECRET_PROVIDER_ERROR_91");
  },
};
const noopAction = async () => ({});
export function useAction(reference: Parameters<typeof getFunctionName>[0]) {
  return actions[getFunctionName(reference)] ?? noopAction;
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
