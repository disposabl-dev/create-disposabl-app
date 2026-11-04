import type { CreateClientConfig } from "./generated/client.gen.js";

const serializeQuery = (query: Record<string, unknown>) =>
  new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => [name, JSON.stringify(value)]),
  ).toString();

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  headers: { ...config?.headers, "X-Disposabl-Source": "sdk" },
  // Generated object parameters otherwise override the client's JSON serializer.
  requestValidator: async (options) => {
    (options as { querySerializer: typeof serializeQuery }).querySerializer =
      serializeQuery;
    return options;
  },
});
