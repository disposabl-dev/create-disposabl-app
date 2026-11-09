import { expect, mock, test } from "bun:test";

// Use the checkout's installed package; observe arguments without replacing its behavior.
const { setupEmailPassword } =
  await import("@convex-dev/auth/methods/email-password/server");
let options;
mock.module("@convex-dev/auth/methods/email-password/server", () => ({
  setupEmailPassword: (core, value) => {
    options = value;
    return setupEmailPassword(core, value);
  },
}));
globalThis.fetch = () => {
  throw new Error("Network forbidden in email setup test");
};

test("email module honors the deployment origin and optional sender", async () => {
  if (process.env.EXPECT_INVALID === "1") {
    await expect(import("../../../backend/convex/authEmail")).rejects.toThrow(
      "setupEmailPassword: urls.signUp",
    );
    return;
  }
  const actual = await import("../../../backend/convex/authEmail");
  const origin = process.env.EXPECT_ORIGIN;
  expect(options.urls).toEqual({
    signUp: `${origin}/verify-email`,
    changeEmail: `${origin}/verify-email`,
    recovery: `${origin}/reset-password`,
  });
  for (const name of [
    "signUpWithEmailPassword",
    "completeSignUp",
    "signInWithEmailPassword",
    "changePassword",
    "startPasswordRecovery",
    "checkPasswordRecovery",
    "completePasswordRecovery",
  ])
    expect(actual[name]).toBeDefined();
  expect(() => options.emailSender.apiKey).toThrow(
    "Email delivery is not configured.",
  );
});
