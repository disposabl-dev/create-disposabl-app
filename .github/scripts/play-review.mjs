import { createHash, createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const scope = "https://www.googleapis.com/auth/androidpublisher";
const root = "https://androidpublisher.googleapis.com";
const supportedImages = new Set([
  "phoneScreenshots",
  "sevenInchScreenshots",
  "tenInchScreenshots",
]);

async function accessToken(account, fetcher) {
  if (
    account.type !== "service_account" ||
    !account.client_email ||
    !account.private_key
  )
    throw new Error("A Google Play service account is required");
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256")
    .update(payload)
    .sign(account.private_key, "base64url");
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${payload}.${signature}`,
    }),
  });
  if (!response.ok)
    throw new Error(`Google authentication failed (${response.status})`);
  const result = await response.json();
  if (!result.access_token)
    throw new Error("Google authentication returned no access token");
  return result.access_token;
}

function imageType(bytes) {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (
      Math.min(width, height) < 320 ||
      Math.max(width, height) > 3840 ||
      Math.max(width, height) > 2 * Math.min(width, height)
    )
      throw new Error(
        "Screenshot dimensions must be 320 to 3840 pixels with an aspect ratio no greater than 2:1",
      );
    return "image/png";
  }
  throw new Error("Screenshots must be PNG files");
}

export async function submitPlayReview({
  packageName,
  track,
  versionCode,
  notes = [],
  screenshots = [],
  account,
  fetcher = fetch,
  token,
}) {
  if (
    !/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/.test(packageName) ||
    !["internal", "alpha", "beta", "production"].includes(track) ||
    !/^[1-9]\d*$/.test(String(versionCode))
  )
    throw new Error("A valid package, track, and version code are required");
  if (!Array.isArray(notes) || !Array.isArray(screenshots))
    throw new Error("Notes and screenshots must be arrays");
  const languages = new Set();
  for (const note of notes) {
    if (
      !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(note.language) ||
      typeof note.text !== "string" ||
      !note.text.trim() ||
      [...note.text].length > 500 ||
      languages.has(note.language)
    )
      throw new Error(
        "Each release note needs a unique language and 1 to 500 characters",
      );
    languages.add(note.language);
  }
  const assets = await Promise.all(
    screenshots.map(async (item) => {
      if (
        !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(item.language) ||
        !supportedImages.has(item.imageType) ||
        typeof item.path !== "string"
      )
        throw new Error(
          "Each screenshot needs a language, supported image type, and file path",
        );
      const bytes = await readFile(item.path);
      if (bytes.length > 8 * 1024 * 1024)
        throw new Error("Screenshot exceeds 8 MB");
      return {
        ...item,
        bytes,
        contentType: imageType(bytes),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }),
  );
  token ||= await accessToken(account, fetcher);
  const base = `/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/edits`;
  async function request(
    path,
    {
      method = "GET",
      body,
      contentType = "application/json",
      upload = false,
    } = {},
  ) {
    const response = await fetcher(`${root}${upload ? "/upload" : ""}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": contentType }),
      },
      ...(body === undefined
        ? {}
        : {
            body:
              contentType === "application/json" ? JSON.stringify(body) : body,
          }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const inReview = result.error?.details?.some(
        (detail) => detail.reason === "CHANGES_ALREADY_IN_REVIEW",
      );
      throw new Error(
        inReview
          ? "Google Play already has changes in review; wait for that review to finish"
          : `Google Play request failed (${response.status})`,
      );
    }
    return response.status === 204 ? {} : response.json();
  }
  const edit = await request(base, { method: "POST", body: {} });
  if (!edit.id) throw new Error("Google Play returned no edit ID");
  const editPath = `${base}/${encodeURIComponent(edit.id)}`;
  const current = await request(`${editPath}/tracks/${track}`);
  const matches = (current.releases || []).filter((release) =>
    release.versionCodes?.map(String).includes(String(versionCode)),
  );
  if (matches.length !== 1 || matches[0].versionCodes.length !== 1)
    throw new Error(
      "The track must contain exactly one release for the requested version code",
    );
  const selected = matches[0];
  if (!["draft", "completed"].includes(selected.status))
    throw new Error(`Release status ${selected.status} cannot be submitted`);
  const pendingNotes = new Map(
    (selected.releaseNotes || []).map((note) => [note.language, note.text]),
  );
  if (
    selected.status === "completed" &&
    notes.some((note) => pendingNotes.get(note.language) !== note.text)
  )
    throw new Error(
      "The submitted release already exists with different notes",
    );
  for (const note of notes) pendingNotes.set(note.language, note.text);
  const grouped = new Map();
  for (const asset of assets) {
    const key = `${asset.language}/${asset.imageType}`;
    const group = grouped.get(key) || [];
    group.push(asset);
    grouped.set(key, group);
  }
  for (const group of grouped.values()) {
    const path = `${editPath}/listings/${encodeURIComponent(group[0].language)}/${group[0].imageType}`;
    const existing = (await request(path)).images || [];
    const hashes = new Set(existing.map((image) => image.sha256));
    for (const image of group) {
      if (hashes.has(image.sha256)) continue;
      if (selected.status === "completed")
        throw new Error("The submitted release has different screenshots");
      if (hashes.size >= 8)
        throw new Error(
          "Google Play screenshot limit reached; existing images were preserved",
        );
      const result = await request(`${path}?uploadType=media`, {
        method: "POST",
        body: image.bytes,
        contentType: image.contentType,
        upload: true,
      });
      if (result.image?.sha256 !== image.sha256)
        throw new Error("Google Play screenshot digest did not match");
      hashes.add(image.sha256);
    }
  }
  if (selected.status === "completed")
    return {
      status: "existing_release",
      versionCode: String(versionCode),
      track,
    };
  const updated = {
    ...selected,
    status: "completed",
    ...(pendingNotes.size
      ? {
          releaseNotes: Array.from(pendingNotes, ([language, text]) => ({
            language,
            text,
          })),
        }
      : {}),
  };
  await request(`${editPath}/tracks/${track}`, {
    method: "PUT",
    body: {
      track,
      releases: current.releases.map((release) =>
        release === selected ? updated : release,
      ),
    },
  });
  await request(
    `${editPath}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`,
    { method: "POST" },
  );
  return { status: "submitted", versionCode: String(versionCode), track };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const config = JSON.parse(
      await readFile(process.env.ANDROID_PLAY_REVIEW_CONFIG, "utf8"),
    );
    const result = await submitPlayReview({
      ...config,
      account: JSON.parse(process.env.ANDROID_PLAY_SERVICE_ACCOUNT || "{}"),
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
