import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { submitPlayReview } from "./play-review.mjs";

const options = {
  packageName: "dev.example.app",
  track: "production",
  versionCode: "42",
  token: "test",
};
function fakePlay({
  status = "draft",
  notes = [],
  images = [],
  conflict = false,
  versions = ["42"],
} = {}) {
  const requests = [];
  const fetcher = async (url, init = {}) => {
    requests.push({ url, init });
    let body = {};
    if (url.endsWith("/edits")) body = { id: "edit" };
    else if (url.endsWith("/tracks/production") && init.method === "GET")
      body = {
        track: "production",
        releases: [
          { status, versionCodes: versions, releaseNotes: notes },
          { status: "completed", versionCodes: ["41"] },
        ],
      };
    else if (url.includes("/listings/") && init.method === "GET")
      body = { images };
    else if (url.includes("uploadType=media"))
      body = {
        image: { sha256: createHash("sha256").update(init.body).digest("hex") },
      };
    if (url.includes(":commit") && conflict)
      return Response.json(
        { error: { details: [{ reason: "CHANGES_ALREADY_IN_REVIEW" }] } },
        { status: 400 },
      );
    return Response.json(body);
  };
  return { requests, fetcher };
}
test("submits the requested draft and preserves other releases", async () => {
  const api = fakePlay();
  const result = await submitPlayReview({
    ...options,
    notes: [{ language: "en-US", text: "New guides" }],
    fetcher: api.fetcher,
  });
  assert.equal(result.status, "submitted");
  const update = api.requests.find((entry) => entry.init.method === "PUT");
  assert.deepEqual(JSON.parse(update.init.body).releases, [
    {
      status: "completed",
      versionCodes: ["42"],
      releaseNotes: [{ language: "en-US", text: "New guides" }],
    },
    { status: "completed", versionCodes: ["41"] },
  ]);
  assert.match(
    api.requests.at(-1).url,
    /changesInReviewBehavior=ERROR_IF_IN_REVIEW/,
  );
});
test("retry observes the existing release without mutations", async () => {
  const api = fakePlay({
    status: "completed",
    notes: [{ language: "en-US", text: "New guides" }],
  });
  const result = await submitPlayReview({
    ...options,
    notes: [{ language: "en-US", text: "New guides" }],
    fetcher: api.fetcher,
  });
  assert.equal(result.status, "existing_release");
  assert.equal(
    api.requests.some(
      (entry) =>
        ["PUT", "DELETE"].includes(entry.init.method) ||
        entry.url.includes(":commit"),
    ),
    false,
  );
});
test("preserves a pending review and surfaces conflict", async () => {
  const api = fakePlay({ conflict: true });
  await assert.rejects(
    submitPlayReview({ ...options, fetcher: api.fetcher }),
    /already has changes in review/,
  );
  assert.match(api.requests.at(-1).url, /ERROR_IF_IN_REVIEW/);
});
test("rejects a release with multiple version codes", async () => {
  const api = fakePlay({ versions: ["42", "43"] });
  await assert.rejects(
    submitPlayReview({ ...options, fetcher: api.fetcher }),
    /exactly one release/,
  );
  assert.equal(
    api.requests.some((entry) => entry.init.method === "PUT"),
    false,
  );
});
test("adds a screenshot, preserves existing images and skips identical bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "play-review-"));
  try {
    const bytes = Buffer.alloc(57);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(13, 8);
    bytes.write("IHDR", 12);
    bytes.write("IDAT", 33);
    bytes.write("IEND", 49);
    bytes.writeUInt32BE(480, 16);
    bytes.writeUInt32BE(800, 20);
    const path = join(dir, "screen.png");
    await writeFile(path, bytes);
    const screenshots = [
      { language: "en-US", imageType: "phoneScreenshots", path },
    ];
    const api = fakePlay({ images: [{ sha256: "existing" }] });
    await submitPlayReview({ ...options, screenshots, fetcher: api.fetcher });
    assert.equal(
      api.requests.filter((entry) => entry.url.includes("uploadType=media"))
        .length,
      1,
    );
    assert.equal(
      api.requests.some((entry) => entry.init.method === "DELETE"),
      false,
    );
    const retry = fakePlay({
      status: "completed",
      images: [{ sha256: createHash("sha256").update(bytes).digest("hex") }],
    });
    const result = await submitPlayReview({
      ...options,
      screenshots,
      fetcher: retry.fetcher,
    });
    assert.equal(result.status, "existing_release");
    assert.equal(
      retry.requests.some((entry) => entry.url.includes("uploadType=media")),
      false,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
