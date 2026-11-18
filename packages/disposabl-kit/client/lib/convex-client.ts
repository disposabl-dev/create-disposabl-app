import type { ConnectionState } from "convex/browser";
import { ConvexReactClient } from "convex/react";

const disconnected: ConnectionState = {
  hasInflightRequests: false,
  isWebSocketConnected: false,
  timeOfOldestInflightRequest: null,
  hasEverConnected: false,
  connectionCount: 0,
  connectionRetries: 0,
  inflightMutations: 0,
  inflightActions: 0,
};

class ServerConvexClient extends ConvexReactClient {
  override connectionState(): ConnectionState {
    // Reading the live state opens a WebSocket during static rendering.
    return disconnected;
  }
}

export function createWebConvexClient(url: string): ConvexReactClient {
  return typeof window === "undefined"
    ? new ServerConvexClient(url)
    : new ConvexReactClient(url);
}
