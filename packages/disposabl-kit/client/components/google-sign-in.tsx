import { useState } from "react";
import { useQuery } from "convex/react";
import {
  useOauth,
  useSignInWithGoogle,
} from "@convex-dev/auth/methods/google/react";
import { api } from "../../../backend/convex/_generated/api";
import { Button } from "./ui/button";
import googleLogo from "../../lib/google-logo.png";

export function GoogleSignIn() {
  const providers = useQuery(api.auth.providers);
  const { signIn } = useSignInWithGoogle(api.auth);
  const { flowError } = useOauth();
  const [pending, setPending] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  if (!providers?.google) return null;

  const error =
    startError ??
    (flowError &&
      (() => {
        switch (flowError.error) {
          case "ACCESS_DENIED":
            return "Google sign-in was cancelled.";
          case "EXPIRED":
            return "That sign-in expired. Please try again.";
          case "INVALID_FLOW":
            return "Please start Google sign-in again in this browser.";
          case "REJECTED":
            return "Google sign-in was declined.";
          case "OTHER_ERROR":
            return "Google sign-in failed. Please try again.";
          default:
            return flowError satisfies never;
        }
      })());

  return (
    <div className="mb-6 space-y-4">
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2.5 border-[#747775] bg-white text-[#1F1F1F] hover:bg-[#f2f2f2] hover:text-[#1F1F1F] dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#232324]"
        disabled={pending}
        onClick={async () => {
          setStartError(null);
          setPending(true);
          const result = await signIn({ redirectTo: window.location.href });
          if (result.status === "error") {
            setPending(false);
            setStartError("Couldn't start Google sign-in. Please try again.");
          }
        }}
      >
        <img
          src={googleLogo}
          alt=""
          className="size-5 shrink-0 object-contain"
        />
        {pending ? "Opening Google…" : "Sign in with Google"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!providers.googleOnly && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>or</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}
    </div>
  );
}
