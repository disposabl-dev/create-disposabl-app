import { test } from "node:test";
import assert from "node:assert/strict";
import { MakerDMG } from "@electron-forge/maker-dmg";
import config from "../../apps/desktop/forge.config.mts";

test("macOS disk image uses a bounded title without overriding artifact names", async () => {
  const maker = config.makers?.find((item) => item instanceof MakerDMG);
  assert.ok(maker instanceof MakerDMG);
  await maker.prepareConfig("arm64");
  assert.equal(maker.config.title, "Install");
  assert.equal(maker.config.name, undefined);
});

test("packaging validates the website Vite embeds", async () => {
  const previous = {
    CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
    VITE_CONVEX_SITE_URL: process.env.VITE_CONVEX_SITE_URL,
  };
  const cases = [
    { convex: "", vite: "", embedded: "", valid: true },
    {
      convex: "https://app.example/path",
      vite: "",
      embedded: "https://app.example/path",
      valid: true,
    },
    {
      convex: "http://127.0.0.1:39876",
      vite: "https://app.example",
      embedded: "http://127.0.0.1:39876",
      valid: false,
    },
    {
      convex: "",
      vite: "https://app.example",
      embedded: "https://app.example",
      valid: true,
    },
    {
      convex: "https://app.example",
      vite: "http://invalid.example",
      embedded: "https://app.example",
      valid: true,
    },
    {
      convex: "",
      vite: "http://invalid.example",
      embedded: "http://invalid.example",
      valid: false,
    },
    { convex: "https://", vite: "", embedded: "https://", valid: false },
    {
      convex: "https://user:pass@app.example",
      vite: "",
      embedded: "https://user:pass@app.example",
      valid: false,
    },
    {
      convex: "HTTPS://app.example",
      vite: "",
      embedded: "HTTPS://app.example",
      valid: false,
    },
  ];
  try {
    for (const [index, item] of cases.entries()) {
      process.env.CONVEX_SITE_URL = item.convex;
      process.env.VITE_CONVEX_SITE_URL = item.vite;
      const vite = await import(
        `../../apps/desktop/vite.main.config.mts?case=${index}`
      );
      assert.equal(
        JSON.parse(vite.default.define.DISPOSABL_WEB_URL),
        item.embedded,
      );
      const hook = config.hooks!.prePackage!;
      const check = () =>
        hook(config as Parameters<typeof hook>[0], "darwin", "arm64");
      if (item.valid) await assert.doesNotReject(check);
      else
        await assert.rejects(
          check,
          /Desktop packaging requires a valid HTTPS website/,
        );
    }
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
