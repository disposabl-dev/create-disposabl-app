import { test, expect } from "e2e";
import { randomUUID } from "node:crypto";
import { backendUrl } from "../project.ts";

test(
  "file ownership survives a new login and isolates other users",
  { platforms: ["backend"], tags: ["files"] },
  async () => {
    const url = new URL(backendUrl());
    test.skip(
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
      "File fixtures require a disposable loopback backend",
    );
    async function call(
      kind: string,
      path: string,
      args: object,
      token?: string,
    ) {
      const response = await fetch(`${url.origin}/api/${kind}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ path, args, format: "json" }),
        signal: AbortSignal.timeout(15000),
      });
      return response.json();
    }
    const providers = await call("query", "auth:providers", {});
    test.skip(
      providers.value?.emailPassword || providers.value?.googleOnly,
      "This fixture requires local username authentication",
    );
    const username = `filestest${randomUUID().replaceAll("-", "")}`;
    const password = `Files-${randomUUID()}!`;
    const first = await call("mutation", "auth:signUpWithUsernamePassword", {
      username,
      password,
    });
    expect(first.value?.status).toBe("complete");
    const token = first.value.tokens.accessToken as string;
    const content = `Owned file ${randomUUID()}`;
    const uploaded = await call(
      "action",
      "files/index:upload",
      {
        filename: "fixture.txt",
        mediaType: "text/plain",
        bytes: { $bytes: Buffer.from(content).toString("base64") },
      },
      token,
    );
    expect(uploaded.status).toBe("success");
    const id = uploaded.value as string;
    try {
      const second = await call("mutation", "auth:signInWithUsernamePassword", {
        username,
        password,
      });
      expect(second.value?.status).toBe("complete");
      const renewed = second.value.tokens.accessToken as string;
      expect(renewed === token).toBe(false);
      const download = await call(
        "action",
        "files/index:getDownload",
        { id },
        renewed,
      );
      expect(download.status).toBe("success");
      expect(await (await fetch(download.value.url)).text()).toBe(content);
      const other = await call("mutation", "auth:signUpWithUsernamePassword", {
        username: `other${randomUUID().replaceAll("-", "")}`,
        password,
      });
      expect(other.value?.status).toBe("complete");
      const stranger = other.value.tokens.accessToken as string;
      expect(
        (await call("action", "files/index:getDownload", { id }, stranger))
          .status,
      ).toBe("error");
      expect(
        (await call("action", "files/index:remove", { id }, stranger)).status,
      ).toBe("error");
      expect(
        (await call("action", "files/index:remove", { id }, renewed)).status,
      ).toBe("success");
      expect(
        (await call("action", "files/index:getDownload", { id }, renewed))
          .status,
      ).toBe("error");
    } finally {
      await call("action", "files/index:remove", { id }, token);
    }
  },
);
