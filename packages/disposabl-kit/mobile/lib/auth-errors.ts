import type {
  SignInWithUsernamePasswordResult,
  SignUpWithUsernamePasswordResult,
} from "@convex-dev/auth/methods/username-password/react";

type AuthError = Extract<
  SignInWithUsernamePasswordResult | SignUpWithUsernamePasswordResult,
  { status: "error" }
>["userError"];

export function authErrorMessage(error: AuthError): string {
  switch (error.error) {
    case "USER_NOT_FOUND":
    case "INVALID_CREDENTIALS":
      return "Incorrect username or password.";
    case "USERNAME_TAKEN":
      return "That username is already taken.";
    case "USERNAME_TOO_SHORT":
      return `Username must be at least ${error.minimumLength} characters.`;
    case "USERNAME_HAS_SURROUNDING_WHITESPACE":
      return "Username can't start or end with spaces.";
    case "USERNAME_HAS_INVALID_CHARACTERS":
      return "Username contains characters that aren't allowed.";
    case "PASSWORD_TOO_SHORT":
      return `Password must be at least ${error.minimumLength} characters.`;
    case "PASSWORD_TOO_LONG":
      return `Password must be at most ${error.maximumLength} characters.`;
    case "PASSWORD_HAS_SURROUNDING_WHITESPACE":
      return "Password can't start or end with spaces.";
    case "PASSWORD_TOO_COMMON":
      return "This password is too common. Choose a different one.";
    case "RATE_LIMITED":
      return `Too many attempts. Try again in ${Math.ceil(error.retryAfterMs / 1000)} seconds.`;
    case "OTHER_ERROR":
      return "Couldn't sign in. Check your connection and try again.";
    default:
      error satisfies never;
      return "Something went wrong. Please try again.";
  }
}
