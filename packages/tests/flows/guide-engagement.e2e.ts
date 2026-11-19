import { expect, test } from "e2e";
import { randomUUID } from "node:crypto";
import { backendUrl } from "../project.ts";

test(
  "guide likes enforce authentication and count each account once",
  { platforms: ["backend"] },
  async () => {
    const base = new URL(backendUrl());
    test.skip(
      !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
      "Guide fixtures require a disposable loopback backend",
    );
    async function call(
      kind: "query" | "mutation",
      path: string,
      args: object,
      token?: string,
    ) {
      const res = await fetch(new URL(`/api/${kind}`, base), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ path, args, format: "json" }),
        signal: AbortSignal.timeout(15_000),
      });
      return res.json();
    }

    const lesson = { lessonId: "welcome" };
    const stats = (token?: string) =>
      call("query", "guides/social:get", lesson, token);
    const like = (liked: boolean, token?: string) =>
      call("mutation", "guides/social:setLike", { ...lesson, liked }, token);
    const initial = await stats();
    expect(initial.status).toBe("success");
    expect(initial.value.liked).toBe(false);
    expect((await like(true)).status).toBe("error");

    const providers = await call("query", "auth:providers", {});
    test.skip(
      providers.value?.googleOnly || providers.value?.emailPassword,
      "Requires local username sign-in",
    );
    const signUp = async () => {
      const result = await call("mutation", "auth:signUpWithUsernamePassword", {
        username: `guides${randomUUID().replaceAll("-", "")}`,
        password: `Guide-${randomUUID()}!`,
      });
      expect(result.value?.status).toBe("complete");
      return result.value.tokens.accessToken as string;
    };
    const author = await signUp();
    expect((await like(true, author)).status).toBe("success");
    expect((await like(true, author)).status).toBe("success");
    expect((await stats(author)).value.liked).toBe(true);
    expect((await stats()).value.likes).toBe(initial.value.likes + 1);
    expect((await like(false, author)).status).toBe("success");
    expect((await stats()).value.likes).toBe(initial.value.likes);
  },
);
