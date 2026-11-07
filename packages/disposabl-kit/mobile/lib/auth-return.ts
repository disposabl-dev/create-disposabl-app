import type { Href } from "expo-router";

/** Authentication returns only to a route inside this app. */
export function authReturnPath(value: unknown): Href {
  return typeof value === "string" &&
    /^\/(?!\/)/.test(value) &&
    !/[\\\r\n]/.test(value)
    ? (value as Href)
    : "/";
}
