import { expect, mock, test } from "bun:test";
import { createContext, createElement, useContext } from "react";
import { act, create } from "react-test-renderer";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const Session = createContext(null);
const token = (id, signature = "signature") =>
  `header.${Buffer.from(JSON.stringify({ sub: id })).toString("base64url")}.${signature}`;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
};
let activeOwner = "A";
let pending;
let uploadPending;
let sendPending;
const sent = mock(() => sendPending?.promise ?? Promise.resolve({}));
const removed = [];
mock.module("../../../../apps/mobile/src/features/product-telemetry", () => ({
  captureProductAction: () => {},
}));
mock.module("@convex-dev/auth/react", () => ({
  useAuthToken: () => useContext(Session),
}));
mock.module("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useAction: (ref) => {
    const name = getFunctionName(ref);
    if (name.endsWith("billing:snapshot")) return () => pending.promise;
    if (name.endsWith("files/index:upload"))
      return () =>
        uploadPending?.promise ?? Promise.resolve(`file-${activeOwner}`);
    if (name.endsWith("files/index:remove"))
      return async ({ id }) => {
        removed.push({ owner: activeOwner, id });
      };
    return sent;
  },
  useMutation: () => mock(),
  useQuery: (ref) => {
    const name = getFunctionName(ref);
    if (name.endsWith("users/index:current")) return { id: activeOwner };
    if (name.endsWith("connections/index:status")) return { ready: true };
    return { kind: "messages", status: "failed", page: [], isDone: true };
  },
}));
mock.module("nativewind", () => ({
  VariableContextProvider: ({ children }) => children,
}));
mock.module("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
mock.module("expo-router/react-navigation", () => ({
  useHeaderHeight: () => 0,
}));
mock.module("expo-router", () => ({
  router: { push: mock(), replace: mock() },
  Stack: { Screen: "Screen" },
  useLocalSearchParams: () => ({ appId: "test-app" }),
}));
mock.module("expo-linking", () => ({ openURL: mock() }));
mock.module("react-native", () => ({
  AppState: { addEventListener: () => ({ remove() {} }) },
  Platform: { OS: "ios" },
  Alert: { alert() {} },
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  FlatList: ({ ListHeaderComponent, ...props }) =>
    createElement("FlatList", props, ListHeaderComponent),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
mock.module("expo-document-picker", () => ({
  getDocumentAsync: async () => ({
    canceled: false,
    assets: [
      { uri: "file:///draft", name: "draft.txt", mimeType: "text/plain" },
    ],
  }),
}));
mock.module("expo-image-picker", () => ({}));
mock.module("expo-file-system", () => ({
  File: class {
    size = 4;
    async arrayBuffer() {
      return new ArrayBuffer(4);
    }
  },
}));
mock.module("@disposabl/disposabl-kit/features", () => ({
  paymentsEnabled: true,
  authenticationEnabled: true,
}));
mock.module("../../../../apps/mobile/src/features/management/details", () => ({
  Details: "Details",
}));
mock.module(
  "../../../../apps/mobile/src/features/management/conversation-header",
  () => ({ ConversationHeader: "Header" }),
);
mock.module(
  "../../../../apps/mobile/src/features/management/response-progress",
  () => ({ ResponseProgress: "Progress" }),
);
mock.module("../../../../apps/mobile/src/features/management/ui", () => ({
  ErrorBoundary: ({ children }) => children,
  Button: "Button",
  Loading: "Loading",
}));
mock.module("../../../../apps/mobile/src/features/studio/ui", () => ({
  Action: "Action",
  Label: "Label",
  Screen: "Screen",
}));
mock.module(
  "../../../../apps/mobile/src/features/studio/connection-panel",
  () => ({ ConnectionPanel: "ConnectionPanel" }),
);
mock.module(
  "../../../../apps/mobile/src/features/studio/message-bubble",
  () => ({ MessageBubble: "Message" }),
);
mock.module(
  "../../../../apps/mobile/src/features/studio/message-composer",
  () => ({ MessageComposer: "Composer" }),
);
mock.module(
  "../../../../packages/disposabl-kit/mobile/billing/session",
  () => ({ billingSession: { acquire: () => 1, release() {} } }),
);
mock.module(
  "../../../../packages/disposabl-kit/mobile/billing/web-checkout",
  () => ({
    useWebCheckout: () => ({
      available: false,
      topupAvailable: false,
      busy: false,
    }),
  }),
);
mock.module(
  "../../../../packages/disposabl-kit/mobile/billing/use-topup",
  () => ({ useTopup: () => ({ product: null, busy: false }) }),
);
const { ConnectionProvider } =
  await import("../../../../apps/mobile/src/features/studio/connections");
const { AppScreen } =
  await import("../../../../apps/mobile/src/features/management/app");
const tree = (id, signature) =>
  createElement(
    Session.Provider,
    { value: token(id, signature) },
    createElement(ConnectionProvider, null, createElement(AppScreen)),
  );

test("session replacement fences pending snapshot and retains prior owner's uploaded file", async () => {
  pending = deferred();
  uploadPending = undefined;
  activeOwner = "A";
  sent.mockClear();
  removed.length = 0;
  let renderer;
  await act(async () => {
    renderer = create(tree("session-A"));
  });
  await act(async () =>
    renderer.root.findByType("Composer").props.onPickAttachment("files"),
  );
  expect(renderer.root.findByType("Composer").props.attachments[0].id).toBe(
    "file-A",
  );
  await act(async () =>
    renderer.root.findByType("Composer").props.onChange("A private draft"),
  );
  await act(async () =>
    renderer.root.findByType("Composer").props.onSend("A private draft"),
  );
  activeOwner = "B";
  await act(async () => renderer.update(tree("session-B")));
  expect(renderer.root.findByType("Composer").props.value).toBe("");
  expect(renderer.root.findByType("Composer").props.attachments).toEqual([]);
  expect(removed).toEqual([]);
  await act(async () => {
    pending.resolve({
      balance: 90,
      hasMonthlyPlan: false,
      nativeSubscriptionsEnabled: false,
      monthlyCheckoutPending: false,
    });
    await pending.promise;
  });
  expect(sent).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType("Action")).toHaveLength(0);
  expect(renderer.root.findByType("Composer").props.value).toBe("");
  await act(async () => renderer.unmount());
});

test("session replacement fences overlapping refreshes and a late upload", async () => {
  activeOwner = "A";
  sent.mockClear();
  removed.length = 0;
  pending = { promise: Promise.resolve({ balance: 0 }) };
  let renderer;
  await act(async () => {
    renderer = create(tree("session-A"));
  });
  await act(async () =>
    renderer.root.findByType("Composer").props.onChange("A draft"),
  );
  await act(async () =>
    renderer.root.findByType("Composer").props.onSend("A draft"),
  );
  const refresh = () =>
    renderer.root
      .findAllByType("Action")
      .find((item) => item.props.label === "Refresh credits")
      .props.onPress();
  const first = deferred();
  const second = deferred();
  pending = first;
  await act(async () => refresh());
  pending = second;
  await act(async () => refresh());
  activeOwner = "B";
  await act(async () => renderer.update(tree("session-B")));
  await act(async () => {
    second.resolve({ balance: 75 });
    await second.promise;
  });
  await act(async () => {
    first.resolve({ balance: 99 });
    await first.promise;
  });
  expect(renderer.root.findByType("Composer").props.value).toBe("");
  expect(renderer.root.findAllByType("Action")).toHaveLength(0);
  expect(sent).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());

  activeOwner = "A";
  uploadPending = deferred();
  await act(async () => {
    renderer = create(tree("session-A"));
  });
  await act(async () =>
    renderer.root.findByType("Composer").props.onPickAttachment("files"),
  );
  activeOwner = "B";
  await act(async () => renderer.update(tree("session-B")));
  await act(async () => {
    uploadPending.resolve("file-A");
    await uploadPending.promise;
  });
  expect(removed).toEqual([]);
  expect(renderer.root.findByType("Composer").props.attachments).toEqual([]);
  expect(sent).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
  uploadPending = undefined;
});

test("leaving a conversation in the same session still removes unsent uploads", async () => {
  activeOwner = "A";
  uploadPending = undefined;
  removed.length = 0;
  let renderer;
  await act(async () => {
    renderer = create(tree("session-A"));
  });
  await act(async () =>
    renderer.root.findByType("Composer").props.onPickAttachment("files"),
  );
  await act(async () => renderer.unmount());
  expect(removed).toEqual([{ owner: "A", id: "file-A" }]);
});

test("token rotation within a session retains the draft and attachment", async () => {
  activeOwner = "A";
  uploadPending = undefined;
  removed.length = 0;
  let renderer;
  await act(async () => {
    renderer = create(tree("session-A"));
  });
  await act(async () =>
    renderer.root.findByType("Composer").props.onPickAttachment("files"),
  );
  await act(async () =>
    renderer.root.findByType("Composer").props.onChange("same session"),
  );
  await act(async () => renderer.update(tree("session-A", "rotated")));
  expect(renderer.root.findByType("Composer").props.value).toBe("same session");
  expect(renderer.root.findByType("Composer").props.attachments[0].id).toBe(
    "file-A",
  );
  expect(removed).toEqual([]);
  await act(async () => renderer.unmount());
});

test("newer balance refresh wins when responses arrive out of order", async () => {
  activeOwner = "A";
  sent.mockClear();
  pending = { promise: Promise.resolve({ balance: 0 }) };
  let renderer;
  await act(async () => {
    renderer = create(tree("session-A"));
  });
  await act(async () =>
    renderer.root.findByType("Composer").props.onSend("draft"),
  );
  const refresh = () =>
    renderer.root
      .findAllByType("Action")
      .find((item) => item.props.label === "Refresh credits")
      .props.onPress();
  const first = deferred();
  const second = deferred();
  pending = first;
  await act(async () => refresh());
  pending = second;
  await act(async () => refresh());
  await act(async () => {
    second.resolve({ balance: 17 });
    await second.promise;
  });
  await act(async () => {
    first.resolve({ balance: 99 });
    await first.promise;
  });
  const text = renderer.root
    .findAllByType("Text")
    .map((item) => item.children.join(""))
    .join(" ");
  expect(text).toContain("Credits: 17");
  expect(text).not.toContain("Credits: 99");
  expect(sent).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

for (const outcome of ["success", "rejected", "uncertain"]) {
  test(`obsolete ${outcome} send cannot affect the new session`, async () => {
    activeOwner = "A";
    uploadPending = undefined;
    pending = { promise: Promise.resolve({ balance: 10 }) };
    sendPending = deferred();
    sent.mockClear();
    removed.length = 0;
    let renderer;
    await act(async () => {
      renderer = create(tree("session-A"));
    });
    await act(async () =>
      renderer.root.findByType("Composer").props.onPickAttachment("files"),
    );
    await act(async () =>
      renderer.root.findByType("Composer").props.onChange("A draft"),
    );
    await act(async () =>
      renderer.root.findByType("Composer").props.onSend("A draft"),
    );
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledWith({
      appId: "test-app",
      prompt: "A draft",
      fileIds: ["file-A"],
    });
    activeOwner = "B";
    await act(async () => renderer.update(tree("session-B")));
    await act(async () =>
      renderer.root.findByType("Composer").props.onPickAttachment("files"),
    );
    await act(async () =>
      renderer.root.findByType("Composer").props.onChange("B draft"),
    );
    expect(renderer.root.findByType("Composer").props.attachments[0].id).toBe(
      "file-B",
    );
    await act(async () => {
      if (outcome === "success") sendPending.resolve({});
      else
        sendPending.reject(
          outcome === "rejected"
            ? new ConvexError("Rejected")
            : new Error("Outcome unknown"),
        );
      await sendPending.promise.catch(() => undefined);
    });
    expect(renderer.root.findByType("Composer").props.value).toBe("B draft");
    expect(renderer.root.findByType("Composer").props.attachments[0].id).toBe(
      "file-B",
    );
    expect(renderer.root.findAllByType("Action")).toHaveLength(0);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(removed).toEqual([]);
    await act(async () => renderer.unmount());
    expect(removed).toEqual([{ owner: "B", id: "file-B" }]);
    sendPending = undefined;
  });
}

test("same-session rotation preserves pending send and accepts its success", async () => {
  activeOwner = "A";
  uploadPending = undefined;
  pending = { promise: Promise.resolve({ balance: 10 }) };
  sendPending = deferred();
  sent.mockClear();
  removed.length = 0;
  let renderer;
  await act(async () => {
    renderer = create(tree("session-A"));
  });
  await act(async () =>
    renderer.root.findByType("Composer").props.onPickAttachment("files"),
  );
  await act(async () =>
    renderer.root.findByType("Composer").props.onChange("A draft"),
  );
  await act(async () =>
    renderer.root.findByType("Composer").props.onSend("A draft"),
  );
  expect(sent).toHaveBeenCalledTimes(1);
  await act(async () => renderer.update(tree("session-A", "rotated")));
  expect(renderer.root.findByType("Composer").props.value).toBe("A draft");
  await act(async () => {
    sendPending.resolve({});
    await sendPending.promise;
  });
  expect(renderer.root.findByType("Composer").props.value).toBe("");
  expect(renderer.root.findByType("Composer").props.attachments).toEqual([]);
  expect(sent).toHaveBeenCalledTimes(1);
  expect(removed).toEqual([]);
  await act(async () => renderer.unmount());
  sendPending = undefined;
});

test("same-session unmount cleans up an explicitly rejected pending upload", async () => {
  activeOwner = "A";
  uploadPending = undefined;
  pending = { promise: Promise.resolve({ balance: 10 }) };
  sendPending = deferred();
  sent.mockClear();
  removed.length = 0;
  let renderer;
  await act(async () => {
    renderer = create(tree("session-A"));
  });
  await act(async () =>
    renderer.root.findByType("Composer").props.onPickAttachment("files"),
  );
  await act(async () =>
    renderer.root.findByType("Composer").props.onSend("A draft"),
  );
  expect(sent).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
  expect(removed).toEqual([]);
  await act(async () => {
    sendPending.reject(new ConvexError("Rejected"));
    await sendPending.promise.catch(() => undefined);
  });
  expect(removed).toEqual([{ owner: "A", id: "file-A" }]);
  sendPending = undefined;
});
