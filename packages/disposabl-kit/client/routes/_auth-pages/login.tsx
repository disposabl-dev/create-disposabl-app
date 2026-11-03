import { Logo } from "../../components/logo";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSignInWithUsernamePassword } from "@convex-dev/auth/methods/username-password/react";
import { api } from "../../../../backend/convex/_generated/api";
import { useEffect, useRef, useState } from "react";
import { useConvexAuth } from "convex/react";
import { getReturnTo } from "../../lib/return-to";

export function LogIn() {
  const { request, returnTo } = Route.useSearch();
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const submitted = useRef(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated && !submitted.current) {
      void navigate({ to: "/", replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);
  const { signIn, pending } = useSignInWithUsernamePassword(api.auth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading || (isAuthenticated && !submitted.current)) return null;

  return (
    <main className="flex min-h-[calc(100svh-73px)] flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="/" className="self-center">
          <Logo />
        </a>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>
              Enter your username and password to log in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                submitted.current = true;
                setError(null);
                const result = await signIn({ username, password });
                if (result.status === "complete") {
                  if (request)
                    await navigate({ to: "/consent", search: { request } });
                  else window.location.assign(returnTo ?? "/dashboard");
                  return;
                }
                submitted.current = false;
                setError(() => {
                  switch (result.userError.error) {
                    case "USER_NOT_FOUND":
                      return "No account exists with that username.";
                    case "INVALID_CREDENTIALS":
                      return "Incorrect username or password.";
                    case "PASSWORD_TOO_SHORT":
                      return `Password must be at least ${result.userError.minimumLength} characters.`;
                    case "PASSWORD_TOO_LONG":
                      return `Password must be at most ${result.userError.maximumLength} characters.`;
                    case "PASSWORD_HAS_SURROUNDING_WHITESPACE":
                      return "Password can't start or end with whitespace.";
                    case "RATE_LIMITED":
                      return `Too many attempts. Try again in ${Math.ceil(result.userError.retryAfterMs / 1000)} seconds.`;
                    case "OTHER_ERROR":
                      // The mutation threw unexpectedly; the original error is
                      // available on `cause` if you want to log or inspect it.
                      console.error("Sign-in failed:", result.userError.cause);
                      return "Something went wrong. Please try again.";
                    default:
                      result.userError satisfies never;
                      console.error("Sign-in failed:", result.userError);
                      return "Something went wrong. Please try again.";
                  }
                });
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="username">Username</FieldLabel>
                  <Input
                    // Using a static id to help password managers behave correctly
                    id="username"
                    name="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                    disabled={pending}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    // Using a static id to help password managers behave correctly
                    id="password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={pending}
                  />
                </Field>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    <strong>{error}</strong>
                  </p>
                ) : null}
                <Field>
                  <Button type="submit" disabled={pending}>
                    {pending ? "Logging in…" : "Log in"}
                  </Button>
                  <FieldDescription className="text-center">
                    Don't have an account?{" "}
                    <Link to="/signup" search={{ request, returnTo }}>
                      Sign up
                    </Link>
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_providers/login")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { request?: string; returnTo?: string } => ({
    returnTo: getReturnTo(search.returnTo),
    request:
      typeof search.request === "string"
        ? search.request.trim() || undefined
        : undefined,
  }),
  component: LogIn,
});
