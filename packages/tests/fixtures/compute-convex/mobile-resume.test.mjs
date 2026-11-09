import { expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { getFunctionName } from "convex/server";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let balance = 0;
let appStateListener;
const send = mock(async () => ({}));
const file = { id: "draft-file", name: "draft.txt" };
const markSent = mock();
const resumeText =
  "Sandbox access ended. Add credits if needed, then send a new message after the sandbox stops.";
mock.module("convex/react", () => ({
  useAction: (ref) =>
    getFunctionName(ref).endsWith("billing:snapshot")
      ? async () => ({
          balance,
          hasMonthlyPlan: false,
          nativeSubscriptionsEnabled: false,
          monthlyCheckoutPending: false,
        })
      : send,
  useMutation: () => mock(),
  useQuery: (ref) =>
    getFunctionName(ref).endsWith("users/index:current")
      ? { id: "test-user" }
      : {
          kind: "messages",
          status: "failed",
          error: resumeText,
          page: [],
          isDone: true,
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
  Stack: { Screen: "Screen" },
  useLocalSearchParams: () => ({ appId: "test-app" }),
}));
mock.module("react-native", () => ({
  AppState: {
    addEventListener: (_event, listener) => {
      appStateListener = listener;
      return { remove() {} };
    },
  },
  Platform: { OS: "ios" },
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  FlatList: ({ ListHeaderComponent, ...props }) =>
    createElement("FlatList", props, ListHeaderComponent),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
mock.module("@disposabl/disposabl-kit/features", () => ({
  paymentsEnabled: true,
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
}));
mock.module(
  "../../../../apps/mobile/src/features/studio/message-bubble",
  () => ({ MessageBubble: "Message" }),
);
mock.module(
  "../../../../apps/mobile/src/features/studio/message-composer",
  () => ({ MessageComposer: "Composer" }),
);
mock.module("../../../../apps/mobile/src/features/studio/attachments", () => ({
  useAttachments: () => ({
    attachments: [file],
    beginSend: () => true,
    markSent,
    sendFailed: mock(),
    isActive: () => true,
    pick: mock(),
    retry: mock(),
    remove: mock(),
    busy: false,
  }),
}));
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
const { AppScreen } =
  await import("../../../../apps/mobile/src/features/management/app");
const { PaymentGate } =
  await import("../../../../apps/mobile/src/features/management/payment-gate");

test("credit refresh never sends; returning preserves the draft and file until explicit send", async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(AppScreen));
  });
  expect(
    renderer.root
      .findAllByType("Text")
      .some((node) => node.children.includes(resumeText)),
  ).toBe(true);
  await act(async () =>
    renderer.root.findByType("Composer").props.onChange("Keep this draft"),
  );
  await act(async () =>
    renderer.root.findByType("Composer").props.onSend("Keep this draft"),
  );
  expect(send).not.toHaveBeenCalled();
  const labels = () => renderer.root.findAllByType("Action");
  expect(
    renderer.root
      .findAllByType("Text")
      .some((node) =>
        node.children.join("").includes("Refreshing credits will not send"),
      ),
  ).toBe(true);
  balance = 10;
  await act(async () => appStateListener("active"));
  expect(send).not.toHaveBeenCalled();
  await act(async () =>
    labels()
      .find((x) => x.props.label === "Refresh credits")
      .props.onPress(),
  );
  expect(send).not.toHaveBeenCalled();
  expect(labels().some((x) => x.props.label === "Continue")).toBe(false);
  await act(async () =>
    labels()
      .find((x) => x.props.label === "Back to message")
      .props.onPress(),
  );
  const composer = renderer.root.findByType("Composer");
  expect(composer.props.value).toBe("Keep this draft");
  expect(composer.props.attachments).toEqual([file]);
  await act(async () => composer.props.onSend("Keep this draft"));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith({
    appId: "test-app",
    prompt: "Keep this draft",
    fileIds: ["draft-file"],
  });
  expect(markSent).toHaveBeenCalledWith(["draft-file"]);
  await act(async () => renderer.unmount());
});

test("new-app payment gate retains its explicit Continue action", async () => {
  const proceed = mock();
  let renderer;
  await act(async () => {
    renderer = create(
      createElement(PaymentGate, {
        customerId: "test-user",
        data: {
          balance: 10,
          hasMonthlyPlan: false,
          nativeSubscriptionsEnabled: false,
          monthlyCheckoutPending: false,
        },
        refresh: async () => 10,
        proceed,
        cancel: mock(),
      }),
    );
  });
  const actions = renderer.root.findAllByType("Action");
  expect(actions.some((item) => item.props.label === "Back to idea")).toBe(
    true,
  );
  await act(async () =>
    actions.find((item) => item.props.label === "Continue").props.onPress(),
  );
  expect(proceed).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});
