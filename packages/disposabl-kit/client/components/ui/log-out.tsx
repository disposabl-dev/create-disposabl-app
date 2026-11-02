import { useAuthActions } from "@convex-dev/auth/react";

export function LogOut() {
  const { signOut } = useAuthActions();
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        window.location.assign("/");
      }}
    >
      Log out
    </button>
  );
}
