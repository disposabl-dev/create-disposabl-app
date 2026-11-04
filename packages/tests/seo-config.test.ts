import { test } from "node:test";
import assert from "node:assert/strict";
import { isProductionSite } from "../disposabl-kit/lib/indexing";

test("both production hosts enable indexing; previews and dev do not", () => {
  const site = {
    origin: "https://example.com",
    backendOrigin: "https://production.convex.site",
  };
  assert.equal(isProductionSite("production", site.origin, site), true);
  assert.equal(isProductionSite("production", site.backendOrigin, site), true);
  assert.equal(
    isProductionSite("production", "https://preview.convex.site", site),
    false,
  );
  assert.equal(isProductionSite("development", site.origin, site), false);
});
