import { expect, test } from "e2e";
import { randomUUID } from "node:crypto";
import { backendUrl } from "../project.ts";

test(
  "guide likes and comments enforce authentication and moderation",
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
    const comments = (token?: string) =>
      call("query", "guides/social:listComments", lesson, token);
    const post = (body: string, token?: string) =>
      call("mutation", "guides/social:postComment", { ...lesson, body }, token);
    const like = (liked: boolean, token?: string) =>
      call("mutation", "guides/social:setLike", { ...lesson, liked }, token);
    const initial = await stats();
    expect(initial.status).toBe("success");
    expect(initial.value.liked).toBe(false);
    expect((await like(true)).status).toBe("error");
    expect((await post("I enjoyed the video.")).status).toBe("error");

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
    const [author, reader, secondReader] = await Promise.all([
      signUp(),
      signUp(),
      signUp(),
    ]);
    expect((await like(true, author)).status).toBe("success");
    expect((await like(true, author)).status).toBe("success");
    expect((await stats(author)).value.liked).toBe(true);
    expect((await stats()).value.likes).toBe(initial.value.likes + 1);
    expect((await like(false, author)).status).toBe("success");
    expect((await stats()).value.likes).toBe(initial.value.likes);

    const body = `The example was helpful. ${randomUUID()}`;
    expect((await post(body, author)).status).toBe("success");
    const authored = (await comments(author)).value.find(
      (item: { body: string }) => item.body === body,
    );
    expect(authored.mine).toBe(true);
    expect((await stats()).value.comments).toBe(initial.value.comments + 1);
    const comment = { commentId: authored.id };
    const social = (operation: string, token: string) =>
      call("mutation", `guides/social:${operation}`, comment, token);
    expect((await social("deleteComment", reader)).status).toBe("error");
    expect((await social("blockCommenter", reader)).status).toBe("success");
    expect(
      (await comments(reader)).value.some(
        (item: { body: string }) => item.body === body,
      ),
    ).toBe(false);
    expect((await social("reportComment", reader)).status).toBe("success");
    expect((await social("reportComment", reader)).status).toBe("success");
    expect((await stats()).value.comments).toBe(initial.value.comments + 1);
    expect((await social("reportComment", secondReader)).status).toBe(
      "success",
    );
    expect((await stats()).value.comments).toBe(initial.value.comments);
    expect(
      (await comments()).value.some(
        (item: { body: string }) => item.body === body,
      ),
    ).toBe(false);
    expect((await social("deleteComment", author)).status).toBe("success");
  },
);
