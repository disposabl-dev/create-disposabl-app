import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const { privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const script = resolve(".github/scripts/store-review.mjs");
const appleReview = resolve(".github/scripts/apple-review.mjs");

function review(bundleId) {
  const root = mkdtempSync(join(tmpdir(), "store-manifest-"));
  try {
    for (const dir of [".github/scripts", ".disposabl/store", "apps/mobile"])
      mkdirSync(join(root, dir), { recursive: true });
    symlinkSync(appleReview, join(root, ".github/scripts/apple-review.mjs"));
    writeFileSync(
      join(root, "apps/mobile/app.json"),
      JSON.stringify({
        expo: {
          ios: { bundleIdentifier: "dev.example.app" },
          version: "1.1.0",
        },
      }),
    );
    writeFileSync(
      join(root, ".disposabl/store/release.json"),
      JSON.stringify({
        ios: {
          version: "1.1.0",
          buildNumber: "42",
          notes: { "en-US": "New guides" },
          reviewNotes: "Open Guides from the home screen.",
          screenshots: [
            {
              locale: "en-US",
              displayType: "APP_IPHONE_67",
              path: "guide.png",
            },
          ],
        },
      }),
    );
    writeFileSync(
      join(root, ".disposabl/store/guide.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+b2ioAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const mock = join(root, "mock.mjs");
    writeFileSync(
      mock,
      `
      import { appendFileSync } from 'node:fs';
      globalThis.fetch = async (input, { method, body }) => {
        const path = new URL(input).pathname;
        appendFileSync(process.env.TRACE, method + ' ' + path + '\\n');
        const entries = {
          '/v1/apps/123': { attributes: { bundleId: process.env.BUNDLE } },
          '/v1/apps/123/appStoreVersions': [{ id:'v', attributes: { versionString:'1.1.0', platform:'IOS', appVersionState:'PREPARE_FOR_SUBMISSION', releaseType:'AFTER_APPROVAL' } }],
          '/v1/apps/123/preReleaseVersions': [{ id:'p', attributes: { version:'1.1.0', platform:'IOS' } }],
          '/v1/preReleaseVersions/p/builds': [{ id:'b', attributes: { version:'42', processingState:'VALID' } }],
          '/v1/apps/123/builds': [{ id:'b', attributes: { version:'42', processingState:'VALID' } }],
          '/v1/builds/b/preReleaseVersion': { id:'p', attributes: { version:'1.1.0', platform:'IOS' } },
          '/v1/appStoreVersions/v/appStoreVersionLocalizations': [{ id:'l', attributes: { locale:'en-US' } }],
          '/v1/appStoreVersions/v/appStoreReviewDetail': { id:'d', attributes: {} },
          '/v1/appStoreVersionLocalizations/l/appScreenshotSets': [{ id:'s', attributes: { screenshotDisplayType:'APP_IPHONE_67' } }],
          '/v1/appScreenshotSets/s/appScreenshots': [],
          '/v1/appScreenshots': { id:'a', attributes: { assetDeliveryState: { state:'AWAITING_UPLOAD' }, uploadOperations: [{ url:'https://uploads.apple.com/upload', offset:0, length:20, method:'PUT', requestHeaders:[] }] } },
          '/v1/appScreenshots/a': { id:'a', attributes: { assetDeliveryState: { state:'COMPLETE' } } },
          '/v1/appStoreVersions/v/relationships/build': null,
          '/v1/apps/123/reviewSubmissions': [],
          '/v1/reviewSubmissions': { id:'r' },
          '/v1/reviewSubmissions/r/items': [],
          '/v1/reviewSubmissions/r': { attributes: { state:'WAITING_FOR_REVIEW' } },
        };
        if (method === 'GET' && !(path in entries)) throw new Error('Unexpected provider request ' + path);
        return Response.json({ data: entries[path], links: {} });
      };`,
    );
    const trace = join(root, "trace");
    const result = spawnSync(process.execPath, [script, "ios"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_OPTIONS: `--import=${pathToFileURL(mock)}`,
        TRACE: trace,
        BUNDLE: bundleId,
        ASC_KEY_ID: "key",
        ASC_ISSUER_ID: "issuer",
        ASC_PRIVATE_KEY: privateKey,
        ASC_APP_ID: "123",
      },
    });
    return { ...result, trace: readFileSync(trace, "utf8") };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("prepares metadata then submits the exact uploaded build", () => {
  const result = review("dev.example.app");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.trace, /PATCH \/v1\/appStoreVersionLocalizations\/l/);
  assert.match(result.trace, /PATCH \/v1\/appStoreReviewDetails\/d/);
  assert.match(result.trace, /POST \/v1\/appScreenshots/);
  assert.match(result.trace, /PUT \/upload/);
  assert.match(result.trace, /PATCH \/v1\/appScreenshots\/a/);
  assert.match(result.trace, /PATCH \/v1\/reviewSubmissions\/r/);
});

test("rejects a different App Store listing before updating metadata", () => {
  const result = review("dev.other.app");
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.trace, /PATCH|POST/);
});
