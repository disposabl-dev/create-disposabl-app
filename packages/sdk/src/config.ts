import type { CreateClientConfig } from "./generated/client.gen.js";
// JSON parameter encoding preserves Convex objects, arrays, booleans and strings.
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  querySerializer: (query) =>
    new URLSearchParams(
      Object.entries(query)
        .filter(([, value]) => value !== undefined)
        .map(([name, value]) => [name, JSON.stringify(value)]),
    ).toString(),
});
