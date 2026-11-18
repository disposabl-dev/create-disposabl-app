import { ConvexProvider, useConvexConnectionState } from "convex/react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createWebConvexClient } from "../disposabl-kit/client/lib/convex-client";

test("prerendering the Convex connection state leaves the WebSocket unopened", () => {
  const webSocket = globalThis.WebSocket;
  globalThis.WebSocket = new Proxy(webSocket, {
    construct() {
      throw new Error("Prerendering opened a WebSocket");
    },
  });

  try {
    function PickupStatus() {
      const { isWebSocketConnected } = useConvexConnectionState();
      return createElement(
        "p",
        null,
        isWebSocketConnected ? "Live" : "Loading",
      );
    }

    const client = createWebConvexClient("https://starter-check.convex.cloud");
    const html = renderToStaticMarkup(
      createElement(ConvexProvider, { client }, createElement(PickupStatus)),
    );
    assert.equal(html, "<p>Loading</p>");
  } finally {
    globalThis.WebSocket = webSocket;
  }
});
