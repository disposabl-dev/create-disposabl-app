import { test, expect } from "e2e";
import { backendUrl, siteUrl, project } from "../project.ts";

async function call(
  kind: "query" | "mutation",
  path: string,
  args: Record<string, unknown>,
) {
  const response = await fetch(`${backendUrl()}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
    signal: AbortSignal.timeout(15000),
  });
  return response.json();
}

test(
  "password operations enforce authentication and sender availability",
  { platforms: ["backend"] },
  async () => {
    test.skip(
      !project.features.includes("authentication"),
      "Authentication not selected",
    );
    const denied = await call("mutation", "auth:changePassword", {
      currentPassword: "Not-a-real-password-1",
      newPassword: "Not-a-real-password-2",
    });
    expect(denied.value?.success).toBe(false);
    expect(denied.value?.userError?.error).toBe("NOT_SIGNED_IN");
    const emailDenied = await call("mutation", "authEmail:changePassword", {
      currentPassword: "Not-a-real-password-1",
      newPassword: "Not-a-real-password-2",
    });
    expect(emailDenied.value?.success).toBe(false);
    expect(emailDenied.value?.userError?.error).toBe("NOT_LOGGED_IN");
    const config = await call("query", "auth:providers", {});
    expect(typeof config.value?.emailPassword).toBe("boolean");
    expect(typeof config.value?.emailDelivery).toBe("boolean");
    if (!config.value?.emailDelivery) {
      const signup = await call(
        "mutation",
        "authEmail:signUpWithEmailPassword",
        {
          email: "auth-check@example.invalid",
          password: "Testing-configuration-9482!",
        },
      );
      expect(signup.status).toBe("error");
    }
    const redirect = await fetch(`${siteUrl()}/.well-known/change-password`, {
      redirect: "manual",
    });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/change-password");
  },
);
