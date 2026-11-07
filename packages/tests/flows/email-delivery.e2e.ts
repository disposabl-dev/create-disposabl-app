import { test, expect } from "e2e";
import { backendUrl } from "../project.ts";

// Explicit provider check, separate from the default offline-capable suite.
test(
  "Resend verification supports email signup and a fresh login",
  { platforms: ["backend"], tags: ["provider-email"] },
  async () => {
    const key = process.env.E2E_RESEND_API_KEY;
    test.skip(!key, "Requires explicit Resend test delivery credentials");
    const origin = backendUrl();
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname))
      throw new Error(
        "Email delivery fixtures require an isolated loopback backend",
      );
    async function call(
      path: string,
      args: Record<string, unknown>,
      token?: string,
      kind = "mutation",
    ) {
      const response = await fetch(`${origin}/api/${kind}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ path, args, format: "json" }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (result.status !== "success")
        throw new Error(`Auth operation failed: ${path}`);
      return result.value;
    }
    async function resend(path: string) {
      const response = await fetch(`https://api.resend.com/${path}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(`Resend test read failed (${response.status})`);
      return response.json();
    }
    expect(
      (await call("auth:providers", {}, undefined, "query")).emailDelivery,
    ).toBe(true);
    const email = `delivered+disposabl-${crypto.randomUUID()}@resend.dev`;
    const password = `Email-${crypto.randomUUID()}!`;
    const signup = await call("authEmail:signUpWithEmailPassword", {
      email,
      password,
    });
    expect(signup.success).toBe(true);
    let messageId: string | undefined;
    for (let attempt = 0; attempt < 15 && !messageId; attempt++) {
      const sent = await resend("emails?limit=30");
      messageId = sent.data.find((message: { to: string[]; id: string }) =>
        message.to.includes(email),
      )?.id;
      if (!messageId) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!messageId)
      throw new Error("Verification message did not reach Resend");
    const message = await resend(`emails/${encodeURIComponent(messageId)}`);
    const content = `${message.html ?? ""} ${message.text ?? ""}`.replaceAll(
      "&amp;",
      "&",
    );
    const links = content.match(/https?:\/\/[^\s<>"']+/g) ?? [];
    const code = links
      .map((link: string) => new URL(link).searchParams.get("code"))
      .find(Boolean);
    if (!code) throw new Error("Verification email has no code link");
    const verified = await call("authEmail:completeSignUp", {
      emailCode: code,
      browserSecret: signup.browserSecret,
    });
    expect(verified.status).toBe("complete");
    const login = await call("authEmail:signInWithEmailPassword", {
      email,
      password,
    });
    expect(login.status).toBe("complete");
    const account = await call(
      "auth:account",
      {},
      login.tokens.accessToken,
      "query",
    );
    expect(account.email).toBe(email);
  },
);
