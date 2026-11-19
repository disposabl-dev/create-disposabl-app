import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let providers;
let renderer;
mock.module("convex/react", () => ({ useQuery: () => providers }));
mock.module("@convex-dev/auth/methods/username-password/react", () => ({
  useSignInWithUsernamePassword: () => ({ pending: false }),
  useSignUpWithUsernamePassword: () => ({ pending: false }),
}));
mock.module("@convex-dev/auth/methods/email-password/react", () => ({
  useSignInWithEmailPassword: () => ({ pending: false }),
  useSignUpWithEmailPassword: () => ({ pending: false }),
}));
mock.module("expo-router", () => ({
  Link: "Link",
  router: {},
  useLocalSearchParams: () => ({}),
}));
mock.module("react-native", () => ({
  Keyboard: {},
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
mock.module("../../disposabl-kit/mobile/lib/convex", () => ({
  api: { auth: {}, authEmail: {} },
}));
mock.module("../../disposabl-kit/mobile/components/auth-ui", () => ({
  AuthButton: "AuthButton",
  AuthScreen: "AuthScreen",
  authClasses: {},
}));
mock.module("../../disposabl-kit/mobile/components/google-sign-in", () => ({
  GoogleSignIn: "GoogleSignIn",
}));
mock.module("../../disposabl-kit/mobile/components/email-verification", () => ({
  EmailVerification: "EmailVerification",
}));
mock.module("../../disposabl-kit/mobile/design/brand-mark", () => ({
  BrandMark: "BrandMark",
}));
const { LoginScreen } =
  await import("../../disposabl-kit/mobile/screens/login");
const { SignupScreen } =
  await import("../../disposabl-kit/mobile/screens/signup");

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  providers = undefined;
});

for (const Screen of [LoginScreen, SignupScreen]) {
  test(`${Screen.name} shows Google before provider discovery and honors the server result`, async () => {
    const render = () => createElement(Screen, { initialGoogleEnabled: true });
    await act(async () => {
      renderer = create(render());
    });
    expect(renderer.root.findByType("GoogleSignIn").props.disabled).toBe(false);
    providers = { google: true };
    await act(async () => renderer.update(render()));
    expect(renderer.root.findAllByType("GoogleSignIn")).toHaveLength(1);
    providers = { google: false };
    await act(async () => renderer.update(render()));
    expect(renderer.root.findAllByType("GoogleSignIn")).toHaveLength(0);
  });
}

test("apps without a known Google provider wait for discovery", async () => {
  await act(async () => {
    renderer = create(createElement(LoginScreen));
  });
  expect(renderer.root.findAllByType("GoogleSignIn")).toHaveLength(0);
  providers = { google: true };
  await act(async () => renderer.update(createElement(LoginScreen)));
  expect(renderer.root.findAllByType("GoogleSignIn")).toHaveLength(1);
});
