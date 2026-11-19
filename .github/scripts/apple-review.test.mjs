import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const { privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
function run(scenario, operation = "review") {
  const dir = mkdtempSync(join(tmpdir(), "apple-review-"));
  try {
    const trace = join(dir, "trace");
    const output = join(dir, "output");
    writeFileSync(output, "");
    const fixture = join(dir, "fixture.mjs");
    writeFileSync(
      fixture,
      `import { appendFileSync } from 'node:fs';
      globalThis.fetch = async (url, options) => {
        const p = url.pathname; const method = options.method;
        appendFileSync(process.env.TRACE, method + ' ' + p + '\\n');
        const scenario = process.env.SCENARIO;
        if (scenario === 'unauthorized') return new Response('{}', {status: 401});
        let data;
        if (p.endsWith('/appStoreVersions')) data = [{id:'v',attributes:{versionString:'1.1.0',platform:'IOS',appVersionState:scenario === 'submitted' ? 'WAITING_FOR_REVIEW' : scenario === 'distributed' ? 'READY_FOR_DISTRIBUTION' : 'PREPARE_FOR_SUBMISSION',releaseType:'AFTER_APPROVAL'}}];
        else if (p.endsWith('/preReleaseVersions')) data = [{id:'pre',attributes:{version:'1.1.0',platform:'IOS'}}];
        else if (p === '/v1/preReleaseVersions/pre/builds') data = scenario === 'absent' ? [] : [{id:'b',attributes:{version:'42',processingState:scenario === 'processing' ? 'PROCESSING' : scenario === 'invalid' ? 'INVALID' : 'VALID'}}];
        else if (p.endsWith('/builds')) data = [{id:'b',attributes:{version:'42',processingState:'VALID'}}];
        else if (p === '/v1/builds/b/preReleaseVersion') data = {id:'pre',attributes:{version:'1.1.0',platform:'IOS'}};
        else if (p.endsWith('/relationships/build') && method === 'GET') data = scenario === 'different' ? {id:'other'} : ['submitted','distributed'].includes(scenario) ? {id:'b'} : null;
        else if (p.endsWith('/reviewSubmissions') && method === 'GET') data = [];
        else if (p === '/v1/reviewSubmissions' && method === 'POST') data = {id:'r'};
        else if (p === '/v1/reviewSubmissions/r/items') data = [];
        else if (p === '/v1/reviewSubmissions/r' && method === 'GET') data = {id:'r',attributes:{state:'WAITING_FOR_REVIEW'}};
        else data = {id:'ok'};
        return new Response(JSON.stringify({data,links:{}}), {status:200,headers:{'content-type':'application/json'}});
      };`,
    );
    const result = spawnSync(
      process.execPath,
      ["--import", fixture, resolve(".github/scripts/apple-review.mjs")],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          ASC_KEY_ID: "key",
          ASC_ISSUER_ID: "issuer",
          ASC_PRIVATE_KEY: privateKey,
          ASC_APP_ID: "123",
          APP_VERSION: "1.1.0",
          BUILD_NUMBER: "42",
          ASC_OPERATION: operation,
          SCENARIO: scenario,
          TRACE: trace,
          GITHUB_OUTPUT: output,
        },
      },
    );
    return {
      ...result,
      trace: readFileSync(trace, "utf8"),
      output: readFileSync(output, "utf8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("submits only the exact processed build", () => {
  const r = run("new");
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    r.trace,
    /PATCH \/v1\/appStoreVersions\/v\/relationships\/build/,
  );
  assert.match(r.trace, /POST \/v1\/reviewSubmissionItems/);
  assert.match(r.trace, /PATCH \/v1\/reviewSubmissions\/r/);
});
test("already submitted build is an idempotent read", () => {
  const r = run("submitted");
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.trace, /POST|PATCH/);
  assert.equal(r.output, "ota=false\n");
  const distributed = run("distributed");
  assert.equal(distributed.status, 0, distributed.stderr);
  assert.equal(distributed.output, "ota=true\n");
});
test("different selected build and preexisting builds fail closed", () => {
  const a = run("different");
  assert.notEqual(a.status, 0);
  assert.doesNotMatch(a.trace, /POST|PATCH/);
  const b = run("existing", "preflight");
  assert.notEqual(b.status, 0);
  assert.doesNotMatch(b.trace, /POST|PATCH/);
});

test("only absent and processing builds request a retry", () => {
  for (const scenario of ["absent", "processing"])
    assert.equal(run(scenario, "verify").status, 75);
  for (const scenario of ["unauthorized", "invalid"])
    assert.notEqual(run(scenario, "verify").status, 75);
});
