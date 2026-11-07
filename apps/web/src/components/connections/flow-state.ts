export { sessionId } from "../../../../../packages/disposabl-kit/lib/auth-session";

const completedKey = "disposabl.connectionsSession";
const cliKey = "disposabl.cliSetup";
export function connectionsSeen(storage: Storage, session: string | null) {
  return Boolean(session && storage.getItem(completedKey) === session);
}
export function completeConnections(storage: Storage, session: string | null) {
  if (session) storage.setItem(completedKey, session);
  storage.removeItem(cliKey);
  storage.removeItem("disposabl.setupAnalytics");
  storage.removeItem("disposabl.setupMobile");
  storage.removeItem("disposabl.setupPayments");
}
// Keep non-secret setup requirements through OAuth cleanup and page refreshes.
// A new explicit setup entry replaces them; completion clears them.
export function setupContext(storage: Storage, url: URL) {
  const query = url.searchParams;
  if (["origin", "features", "mobile"].some((key) => query.has(key))) {
    storage.setItem(cliKey, query.get("origin") === "cli" ? "1" : "0");
    storage.setItem(
      "disposabl.setupAnalytics",
      query.get("features")?.split(",").includes("analytics") ? "1" : "0",
    );
    storage.setItem(
      "disposabl.setupPayments",
      query.get("features")?.split(",").includes("payments") ? "1" : "0",
    );
    storage.setItem(
      "disposabl.setupMobile",
      query.get("mobile") === "1" ? "1" : "0",
    );
  }
  return {
    fromCli: storage.getItem(cliKey) === "1",
    payments: storage.getItem("disposabl.setupPayments") === "1",
    analytics: storage.getItem("disposabl.setupAnalytics") === "1",
    mobile: storage.getItem("disposabl.setupMobile") === "1",
  };
}
