import { createAppleClient } from "./apple-api.mjs";
import { appendFileSync } from "node:fs";
const output = (name, value) => {
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
};

// Operate only on an existing version and the exact processed build uploaded by
// this run. Never replace an already-selected build or another review draft.
const {
  ASC_KEY_ID,
  ASC_ISSUER_ID,
  ASC_PRIVATE_KEY,
  ASC_APP_ID,
  APP_VERSION,
  BUILD_NUMBER,
  ASC_OPERATION = "review",
} = process.env;
if (
  ![ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY, ASC_APP_ID, APP_VERSION].every(
    Boolean,
  ) ||
  (ASC_OPERATION !== "preflight" && !BUILD_NUMBER)
)
  throw new Error(
    "Missing App Store Connect review credentials or exact build identity",
  );
const { request, list } = createAppleClient({
  keyId: ASC_KEY_ID,
  issuerId: ASC_ISSUER_ID,
  privateKey: ASC_PRIVATE_KEY,
});
const one = (items, label) => {
  if (items.length !== 1)
    throw new Error(`Expected exactly one ${label}; found ${items.length}`);
  return items[0];
};
const relation = (type, id) => ({ data: { type, id } });
const versions = await list(
  `/v1/apps/${ASC_APP_ID}/appStoreVersions?limit=200`,
);
const version = one(
  versions.filter(
    (v) =>
      v.attributes.versionString === APP_VERSION &&
      v.attributes.platform === "IOS",
  ),
  "matching iOS version",
);
const state =
  version.attributes.appVersionState ?? version.attributes.appStoreState;
const prereleases = (
  await list(`/v1/apps/${ASC_APP_ID}/preReleaseVersions?limit=200`)
).filter(
  (p) =>
    p.attributes.version === APP_VERSION && p.attributes.platform === "IOS",
);
if (prereleases.length > 1)
  throw new Error("Multiple matching iOS prerelease versions");
const builds = prereleases.length
  ? await list(`/v1/preReleaseVersions/${prereleases[0].id}/builds?limit=200`)
  : [];
if (ASC_OPERATION === "preflight") {
  if (state !== "PREPARE_FOR_SUBMISSION")
    throw new Error(`Cannot build for version in state ${state}`);
  if (builds.length)
    throw new Error(
      "A build for this version already exists; reconcile its runtime provenance before retrying",
    );
  console.log(`No existing iOS build for ${APP_VERSION}; safe to build.`);
  process.exit(0);
}
const matching = builds.filter((b) => b.attributes.version === BUILD_NUMBER);
if (
  ASC_OPERATION === "verify" &&
  (matching.length === 0 ||
    (matching.length === 1 &&
      matching[0].attributes.processingState === "PROCESSING"))
) {
  console.log("Apple has not finished processing the uploaded build.");
  process.exit(75);
}
const build = one(
  matching.filter((b) => b.attributes.processingState === "VALID"),
  "processed build number",
);
if (ASC_OPERATION === "verify") {
  console.log(`Apple processed iOS ${APP_VERSION} build ${BUILD_NUMBER}.`);
  process.exit(0);
}
if (ASC_OPERATION !== "review") throw new Error("Unknown ASC operation");
const selected = await request(
  `/v1/appStoreVersions/${version.id}/relationships/build`,
);
if (
  [
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "PROCESSING_FOR_DISTRIBUTION",
    "READY_FOR_DISTRIBUTION",
    "READY_FOR_SALE",
  ].includes(state)
) {
  if (selected.data?.id !== build.id)
    throw new Error("Version is already submitted with a different build");
  if (
    ["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(state) &&
    version.attributes.releaseType !== "AFTER_APPROVAL"
  )
    throw new Error("Existing review is not configured for automatic release");
  output(
    "ota",
    ["READY_FOR_DISTRIBUTION", "READY_FOR_SALE"].includes(state)
      ? "true"
      : "false",
  );
  console.log(
    `Version ${APP_VERSION} build ${BUILD_NUMBER} already has state ${state}; no changes made.`,
  );
  process.exit(0);
}
if (
  ![
    "PREPARE_FOR_SUBMISSION",
    "READY_FOR_REVIEW",
    "DEVELOPER_REJECTED",
    "REJECTED",
    "METADATA_REJECTED",
  ].includes(state)
)
  throw new Error(`Cannot modify version in state ${state}`);
if (selected.data && selected.data.id !== build.id)
  throw new Error("A different build is already selected on the version");
const submissions = await list(
  `/v1/apps/${ASC_APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=200`,
);
const active = submissions.filter((s) =>
  [
    "READY_FOR_REVIEW",
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "UNRESOLVED_ISSUES",
    "CANCELING",
    "COMPLETING",
  ].includes(s.attributes.state),
);
if (active.length > 1)
  throw new Error(
    "Multiple active review submissions require manual reconciliation",
  );
let submission = active[0];
if (submission && submission.attributes.state !== "READY_FOR_REVIEW")
  throw new Error(`Existing submission is ${submission.attributes.state}`);
if (!submission)
  submission = (
    await request("/v1/reviewSubmissions", "POST", {
      type: "reviewSubmissions",
      attributes: { platform: "IOS" },
      relationships: { app: relation("apps", ASC_APP_ID) },
    })
  ).data;
const items = await list(
  `/v1/reviewSubmissions/${submission.id}/items?include=appStoreVersion&limit=200`,
);
if (
  items.some((i) => i.relationships?.appStoreVersion?.data?.id !== version.id)
)
  throw new Error("Review draft contains other items; refusing to submit them");
if (items.length > 1)
  throw new Error("Duplicate version items in review draft");
if (version.attributes.releaseType !== "AFTER_APPROVAL")
  await request(`/v1/appStoreVersions/${version.id}`, "PATCH", {
    type: "appStoreVersions",
    id: version.id,
    attributes: { releaseType: "AFTER_APPROVAL" },
  });
if (!selected.data)
  await request(
    `/v1/appStoreVersions/${version.id}/relationships/build`,
    "PATCH",
    {
      type: "builds",
      id: build.id,
    },
  );
if (!items.length)
  await request("/v1/reviewSubmissionItems", "POST", {
    type: "reviewSubmissionItems",
    relationships: {
      reviewSubmission: relation("reviewSubmissions", submission.id),
      appStoreVersion: relation("appStoreVersions", version.id),
    },
  });
await request(`/v1/reviewSubmissions/${submission.id}`, "PATCH", {
  type: "reviewSubmissions",
  id: submission.id,
  attributes: { submitted: true },
});
const confirmed = (await request(`/v1/reviewSubmissions/${submission.id}`))
  .data;
if (!["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(confirmed.attributes?.state))
  throw new Error(
    `Review submission was not confirmed: ${confirmed.attributes?.state}`,
  );
output("ota", "false");
console.log(
  `Submitted iOS ${APP_VERSION} build ${BUILD_NUMBER} for App Review.`,
);
