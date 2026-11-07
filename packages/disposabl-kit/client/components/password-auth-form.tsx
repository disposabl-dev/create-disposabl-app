import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from "@convex-dev/auth/methods/username-password/react";
import {
  useSignInWithEmailPassword,
  useSignUpWithEmailPassword,
} from "@convex-dev/auth/methods/email-password/react";
import { useConvexAuth, useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../backend/convex/_generated/api";
import { authErrorMessage } from "../../lib/auth-errors";
import { GoogleSignIn } from "./google-sign-in";
import { PasswordPage } from "./password-page";
import { Button } from "./ui/button";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function PasswordAuthForm({
  mode,
  request,
  returnTo,
}: {
  mode: "login" | "signup";
  request?: string;
  returnTo?: string;
}) {
  const providers = useQuery(api.auth.providers);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const usernameIn = useSignInWithUsernamePassword(api.auth);
  const usernameUp = useSignUpWithUsernamePassword(api.auth);
  const emailIn = useSignInWithEmailPassword(api.authEmail);
  const emailUp = useSignUpWithEmailPassword(api.authEmail);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const submitting = useRef(false);
  const signup = mode === "signup";
  const email = Boolean(providers?.emailPassword);
  const pending =
    usernameIn.pending ||
    usernameUp.pending ||
    emailIn.pending ||
    emailUp.pending;
  const destination = request
    ? `/consent?request=${encodeURIComponent(request)}`
    : (returnTo ?? "/dashboard");
  useEffect(() => {
    if (!isLoading && isAuthenticated && !submitting.current)
      window.location.replace(destination);
  }, [destination, isAuthenticated, isLoading]);
  if (isLoading || !providers || (isAuthenticated && !submitting.current))
    return null;

  if (providers.googleOnly)
    return (
      <PasswordPage
        title="Welcome to Disposabl"
        description="Sign in or create an account with Google."
      >
        <GoogleSignIn />
      </PasswordPage>
    );

  return (
    <PasswordPage
      title={signup ? "Create your account" : "Welcome back"}
      description={
        email
          ? "Use your email and password to continue."
          : "Use your username and password to continue."
      }
    >
      <GoogleSignIn />
      {sent ? (
        <div role="status" className="space-y-4">
          <p>
            Check your email and open the verification link in this browser to
            finish signing up.
          </p>
          <p>You can close this page while waiting.</p>
        </div>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (submitting.current) return;
            setError(null);
            if (signup && password !== confirmation) {
              setError("Passwords don't match.");
              return;
            }
            submitting.current = true;
            try {
              if (email && signup) {
                sessionStorage.setItem("auth-email-return-to", destination);
                const result = await emailUp.signUp({
                  email: login,
                  password,
                });
                if (result.success) {
                  setPassword("");
                  setConfirmation("");
                  setSent(true);
                } else setError(authErrorMessage(result.userError));
              } else {
                const result = email
                  ? await emailIn.signIn({ email: login, password })
                  : await (signup ? usernameUp.signUp : usernameIn.signIn)({
                      username: login,
                      password,
                    });
                if (result.status === "complete") {
                  window.location.assign(destination);
                  return;
                }
                setError(authErrorMessage(result.userError));
              }
            } catch {
              setError("Couldn't connect. Please try again.");
            } finally {
              submitting.current = false;
            }
          }}
        >
          <FieldGroup>
            {email && signup && !providers.emailDelivery && (
              <p role="alert">
                Email signup is temporarily unavailable. Please try again later.
              </p>
            )}
            <Field>
              <FieldLabel htmlFor="username">
                {email ? "Email" : "Username"}
              </FieldLabel>
              <Input
                className="h-12 rounded-xl border-[#d9dce3] bg-white px-4"
                id="username"
                name={email ? "email" : "username"}
                type={email ? "email" : "text"}
                autoComplete="username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                required
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                className="h-12 rounded-xl border-[#d9dce3] bg-white px-4"
                id="password"
                name="password"
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={pending}
              />
            </Field>
            {signup && (
              <Field>
                <FieldLabel htmlFor="confirmation">Confirm password</FieldLabel>
                <Input
                  className="h-12 rounded-xl border-[#d9dce3] bg-white px-4"
                  id="confirmation"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  required
                  disabled={pending}
                />
              </Field>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="h-12 w-full rounded-xl bg-[#161b2e] text-white hover:bg-[#303850]"
              disabled={
                pending || (signup && email && !providers.emailDelivery)
              }
            >
              {pending ? "Please wait…" : signup ? "Create account" : "Log in"}
            </Button>
          </FieldGroup>
        </form>
      )}
      <div className="mt-5 space-y-3 text-center text-sm">
        {providers.emailDelivery && (
          <Link
            className="block font-medium text-[#2855c5] underline-offset-4 hover:underline"
            to="/forgot-password"
          >
            Forgot password?
          </Link>
        )}
        <Link
          className="block font-medium text-[#2855c5] underline-offset-4 hover:underline"
          to={signup ? "/login" : "/signup"}
          search={{ request, returnTo }}
        >
          {signup
            ? "Already have an account? Log in"
            : "Don't have an account? Sign up"}
        </Link>
      </div>
    </PasswordPage>
  );
}
