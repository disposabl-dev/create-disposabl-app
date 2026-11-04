import { test, expect } from "e2e";
import { siteUrl } from "../project.ts";

test("enabled API publishes its contract", { platforms: ["api"] }, async () => {
  const response = await fetch(`${siteUrl()}/openapi.json`, {
    signal: AbortSignal.timeout(15_000),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  const contract = await response.json();
  expect(contract.openapi).toMatch(/^3\./);
  expect(typeof contract.paths).toBe("object");
  expect(contract.paths).not.toBeNull();
});
