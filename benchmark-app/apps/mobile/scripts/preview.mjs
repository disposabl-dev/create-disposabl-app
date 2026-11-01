import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mobileRoot as mobile, run as execute } from "./build-android.mjs";
const root = resolve(mobile, "../..");
const out = join(root, "dist/release");
const eas = ["bun", "x", "eas-cli@27.2.0"];
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const save = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const output = (key, value) =>
  appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
const run = (args, cwd = root, capture = false) =>
  execute(args[0], args.slice(1), {
    cwd,
    ...(capture ? { stdio: ["ignore", "pipe", "inherit"] } : {}),
  });
const api = (path) =>
  JSON.parse(
    run(
      ["gh", "api", `repos/${process.env.GITHUB_REPOSITORY}/${path}`],
      root,
      true,
    ),
  );
function currentSource(plan) {
  const current = plan.pr ? api(`pulls/${plan.pr}`) : api("git/ref/heads/main");
  if (
    plan.pr
      ? current.state !== "open" || current.head.sha !== plan.source
      : current.object.sha !== plan.source
  )
    throw new Error("Preview source is outdated or closed");
}
export function androidBaseline(release, wanted) {
  const info = /<!-- android (\{[^\n]+\}) -->/.exec(release?.body || "")?.[1];
  if (!info || release.draft) return null;
  const prior = JSON.parse(info);
  const same = [
    "projectId",
    "applicationId",
    "runtimeVersion",
    "channel",
  ].every((key) => prior[key] === wanted[key]);
  const asset = release.assets?.find(
    (file) =>
      file.name === "android.apk" &&
      file.state === "uploaded" &&
      file.size > 0 &&
      file.digest === `sha256:${prior.sha256}`,
  );
  return same && /^[a-f0-9]{64}$/.test(prior.sha256 || "") && asset
    ? { ...prior, tag: release.tag_name }
    : null;
}

async function android(plan, command) {
  const { runtimeVersion, buildAndroid } = await import("./build-android.mjs");
  if (command === "prepare") {
    const config = JSON.parse(
      run(
        ["bun", "x", "--no-install", "expo", "config", "--json"],
        mobile,
        true,
      ),
    );
    if (!config.extra?.eas?.projectId)
      throw new Error("Link an Expo project first");
    const wanted = {
      channel: plan.channel,
      projectId: config.extra.eas.projectId,
      applicationId: config.android.package,
      runtimeVersion: runtimeVersion(),
    };
    let previous;
    for (let page = 1; ; page++) {
      const releases = api(`releases?per_page=100&page=${page}`);
      const latest = releases.find(
        (release) =>
          !release.draft &&
          release.tag_name.startsWith(`app-${plan.channel}-`) &&
          release.assets?.some((asset) => asset.name === "android.apk"),
      );
      if (latest) {
        previous = androidBaseline(latest, wanted);
        break;
      }
      if (releases.length < 100) break;
    }
    save(join(out, "android-plan.json"), { ...wanted, previous });
    output("android_build", String(!previous));
    return;
  }
  const wanted = read(join(out, "android-plan.json"));
  if (wanted.runtimeVersion !== runtimeVersion())
    throw new Error("Android fingerprint changed after planning");
  let found = false;
  for (let offset = 0; !found; offset += 25) {
    const { currentPage } = JSON.parse(
      run(
        [
          ...eas,
          "channel:list",
          "--json",
          "--limit",
          "25",
          "--offset",
          String(offset),
        ],
        mobile,
        true,
      ),
    );
    found = currentPage.some((channel) => channel.name === plan.channel);
    if (currentPage.length < 25) break;
  }
  if (!found)
    run([...eas, "channel:create", plan.channel, "--non-interactive"], mobile);
  const apk = join(out, "android.apk");
  if (wanted.previous) {
    run([
      "gh",
      "release",
      "download",
      wanted.previous.tag,
      "--pattern",
      "android.apk",
      "--dir",
      out,
      "--clobber",
    ]);
    if (hash(apk) !== wanted.previous.sha256)
      throw new Error("Downloaded APK checksum mismatch");
    run(
      [
        "bun",
        "x",
        "--no-install",
        "expo",
        "export",
        "--platform",
        "android",
        "--output-dir",
        "dist/update",
      ],
      mobile,
    );
    if (runtimeVersion() !== wanted.runtimeVersion)
      throw new Error("Android fingerprint changed during export");
    currentSource(plan);
    run(
      [
        ...eas,
        "update",
        "--platform",
        "android",
        "--channel",
        plan.channel,
        "--environment",
        plan.environment,
        "--skip-bundler",
        "--input-dir",
        "dist/update",
        "--message",
        plan.source,
        "--non-interactive",
      ],
      mobile,
    );
  } else copyFileSync(buildAndroid(wanted.runtimeVersion), apk);
  const { previous, ...info } = wanted;
  save(join(out, "android.json"), {
    ...info,
    sha256: hash(apk),
    action: previous ? "update" : "build",
  });
  rmSync(join(out, "android-plan.json"));
}

async function main(command) {
  const event = read(process.env.GITHUB_EVENT_PATH);
  const plan = {
    channel: process.env.CHANNEL,
    source: process.env.SOURCE,
    pr: event.number,
    environment: event.pull_request ? "preview" : "production",
  };
  currentSource(plan);
  mkdirSync(out, { recursive: true });
  if (command.startsWith("mobile-")) {
    if (process.env.PLATFORM === "android")
      await android(plan, command.slice(7));
    else
      run(
        [
          ...eas,
          "build",
          "--platform",
          "ios",
          "--profile",
          `ios-${plan.environment}`,
          "--local",
          "--non-interactive",
          "--freeze-credentials",
          "--output",
          join(out, "ios-device.ipa"),
        ],
        mobile,
      );
    return;
  }
  Object.assign(process.env, {
    DISPOSABL_MOBILE_CHANNEL: plan.channel,
    DISPOSABL_ANDROID_CHANNEL: plan.channel,
    DISPOSABL_ANDROID_VERSION_CODE: process.env.GITHUB_RUN_NUMBER,
    DISPOSABL_IOS_BUILD_NUMBER: process.env.GITHUB_RUN_NUMBER,
    EXPO_PUBLIC_CONVEX_URL: process.env.DISPOSABL_DEPLOYED_CONVEX_URL,
    EXPO_PUBLIC_CONVEX_SITE_URL: process.env.DISPOSABL_DEPLOYED_CONVEX_SITE_URL,
  });
  run(
    [
      ...eas,
      "env:exec",
      plan.environment,
      `bun scripts/preview.mjs mobile-${command}`,
      "--non-interactive",
    ],
    mobile,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main(process.argv[2] || "build");
