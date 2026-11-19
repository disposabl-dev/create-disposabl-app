import { test, expect } from "e2e";
import { backendUrl } from "../project.ts";

test(
  "public hostname lookup rejects foreign and unknown hosts",
  { platforms: ["backend"] },
  async () => {
    for (const hostname of [
      "example.com",
      "nested.app.disposabl.xyz",
      "unknown-host-gateway-check.disposabl.xyz",
    ]) {
      const response = await fetch(`${backendUrl()}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "gateway/index:resolve",
          args: { hostname },
          format: "json",
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        status: "success",
        value: null,
      });
    }
  },
);
