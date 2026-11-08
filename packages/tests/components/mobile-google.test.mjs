import { afterEach, beforeEach, mock, test, expect } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { mobileAuthReturnUrl } from "../../disposabl-kit/lib/mobile-auth";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const signIn = mock();
const openBrowser = mock();
const replace = mock();
const setParams = mock();
let params = {};
let renderer;
mock.module("@convex-dev/auth/methods/google/react", () => ({
  useSignInWithGoogle: () => ({ signIn }),
}));
mock.module("expo-router", () => ({
  router: { replace, setParams },
  useLocalSearchParams: () => params,
}));
mock.module("expo-web-browser", () => ({ openAuthSessionAsync: openBrowser }));
mock.module("react-native", () => ({ Text: "Text", View: "View" }));
mock.module("../../disposabl-kit/mobile/lib/convex", () => ({
  api: { auth: {} },
}));
mock.module("../../disposabl-kit/mobile/components/auth-ui", () => ({
  authClasses: {},
}));
mock.module("../../disposabl-kit/mobile/components/google-button", () => ({
  GoogleButton: "Button",
}));
const { GoogleSignIn } =
  await import("../../disposabl-kit/mobile/components/google-sign-in");
const previousOrigin = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
beforeEach(() => {
  process.env.EXPO_PUBLIC_CONVEX_SITE_URL = "https://example.convex.site";
  params = {};
  for (const fn of [signIn, openBrowser, replace, setParams]) fn.mockReset();
  signIn.mockImplementation(async ({ code }) =>
    code
      ? { status: "complete" }
      : {
          status: "redirect",
          redirect: new URL("https://accounts.google.com/oauth"),
        },
  );
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  if (previousOrigin === undefined)
    delete process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
  else process.env.EXPO_PUBLIC_CONVEX_SITE_URL = previousOrigin;
});
async function mount() {
  await act(async () => {
    renderer = create(createElement(GoogleSignIn));
  });
}
async function press() {
  await act(async () => {
    renderer.root.findByType("Button").props.onPress();
  });
}
test("Google browser return redeems once and opens home", async () => {
  openBrowser.mockResolvedValue({
    type: "success",
    url: `${mobileAuthReturnUrl}?convexAuthCode=ticket`,
  });
  await mount();
  await press();
  expect(signIn.mock.calls).toEqual([
    [{ redirectTo: "https://example.convex.site/oauth/mobile" }],
    [{ code: "ticket" }],
  ]);
  expect(replace).toHaveBeenCalledWith("/");
  params = { convexAuthCode: "ticket" };
  await act(async () => renderer.update(createElement(GoogleSignIn)));
  expect(signIn).toHaveBeenCalledTimes(2);
});
test("cancelling the browser allows another attempt without redeeming", async () => {
  openBrowser.mockResolvedValue({ type: "cancel" });
  await mount();
  await press();
  expect(signIn).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByType("Button").props.pending).toBe(false);
  expect(replace).not.toHaveBeenCalled();
  await press();
  expect(openBrowser).toHaveBeenCalledTimes(2);
});
test("a callback into a newly mounted route uses Convex's saved flow", async () => {
  params = { convexAuthCode: "ticket" };
  await mount();
  expect(signIn).toHaveBeenCalledWith({ code: "ticket" });
  expect(setParams).toHaveBeenCalledWith({
    convexAuthCode: undefined,
    convexAuthError: undefined,
  });
  expect(replace).toHaveBeenCalledWith("/");
});
test("a browser response after dismissal cannot sign in", async () => {
  let resolve;
  openBrowser.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await mount();
  await press();
  await act(async () => renderer.unmount());
  renderer = undefined;
  await act(async () =>
    resolve({
      type: "success",
      url: `${mobileAuthReturnUrl}?convexAuthCode=ticket`,
    }),
  );
  expect(signIn).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();
});

test("a failed cold-return redemption shows a recoverable error", async () => {
  params = { convexAuthCode: "ticket" };
  signIn.mockRejectedValue(new Error("connection lost"));
  await mount();
  expect(
    renderer.root.findByProps({ accessibilityRole: "alert" }).props.children,
  ).toBe("Couldn't complete Google sign-in. Please try again.");
  expect(renderer.root.findByType("Button").props.pending).toBe(false);
  expect(replace).not.toHaveBeenCalled();
});

test("Google sign-in returns to the selected creation example", async () => {
  params = { returnTo: "/compose?exampleSlug=field" };
  openBrowser.mockResolvedValue({
    type: "success",
    url: `${mobileAuthReturnUrl}?convexAuthCode=ticket`,
  });
  await mount();
  await press();
  expect(replace).toHaveBeenCalledWith("/compose?exampleSlug=field");
});
