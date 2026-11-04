import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

export function LogOut() {
  const { signOut } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(false);
          try {
            await signOut();
            window.location.assign("/");
          } catch {
            setError(true);
            setPending(false);
          }
        }}
      >
        {pending ? "Logging out…" : "Logout"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          Couldn't log out. Please try again.
        </p>
      )}
    </div>
  );
}
