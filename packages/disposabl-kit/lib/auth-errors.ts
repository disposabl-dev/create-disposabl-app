/** User-facing errors only. Never render raw backend exceptions or credentials. */
export function authErrorMessage(error: {
  error: string;
  minimumLength?: number;
  maximumLength?: number;
  retryAfterMs?: number;
}): string {
  switch (error.error) {
    case "USER_NOT_FOUND":
    case "INVALID_CREDENTIALS":
      return "Incorrect login or password.";
    case "USERNAME_TAKEN":
      return "That username is already taken.";
    case "EMAIL_TAKEN":
      return "That email is already in use. Try logging in or resetting your password.";
    case "EMAIL_NOT_FOUND":
      return "If this email belongs to an account, a reset link will arrive shortly.";
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
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
      return `Too many attempts. Try again in ${Math.ceil((error.retryAfterMs ?? 60000) / 1000)} seconds.`;
    case "NOT_SIGNED_IN":
    case "NOT_LOGGED_IN":
      return "Your session has expired. Please log in again.";
    case "MISSING_SECRET":
      return "Open this link in the same browser or app where you started. Otherwise, request a new link.";
    case "INCORRECT_CODE":
    case "INVALID_CHALLENGE":
      return "This link is invalid, expired, or already used. Request a new one.";
    default:
      return "Something went wrong. Please try again.";
  }
}
