import { rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  guideLessons,
  type GuideLesson,
} from "../../../packages/disposabl-kit/guides";

type Asset = {
  id: string;
  passthrough?: string;
  meta?: { external_id?: string };
  status: "preparing" | "ready" | "errored";
  duration?: number;
  playback_ids?: { id: string; policy: string }[];
  tracks?: {
    id: string;
    type: string;
    text_type?: string;
    language_code?: string;
    status?: "preparing" | "ready" | "errored";
  }[];
};
type Review = {
  lesson: string;
  duration: number;
  fullMasterDecode: string;
  frameReview?: string;
  posterTimeSeconds: number;
  sha256: Record<string, string>;
};

const [folder, mode] = process.argv.slice(2);
if (
  !folder ||
  !["--check", "--archive", "--pilot", "--upload"].includes(mode)
) {
  throw new Error(
    "Usage: bun apps/web/scripts/publish-guides.ts <finished-folder> --check|--archive|--pilot|--upload",
  );
}

const finished = resolve(folder);
const selected = mode === "--pilot" ? guideLessons.slice(0, 2) : guideLessons;
const inputs = await Promise.all(
  selected.map(async (lesson) => {
    const directory = join(finished, lesson.id);
    const filename = `${lesson.id}.mp4`;
    const review: Review = await Bun.file(
      join(directory, "production.json"),
    ).json();
    const [video, captions, cover] = await Promise.all([
      inputFile(join(directory, filename), "video/mp4"),
      inputFile(join(directory, `${lesson.id}.vtt`), "text/vtt"),
      inputFile(join(directory, `${lesson.id}.jpg`), "image/jpeg"),
    ]);
    if (
      review.lesson !== lesson.id ||
      review.fullMasterDecode !== "passed" ||
      !review.frameReview ||
      video.sha !== review.sha256[filename] ||
      Math.abs(review.duration - lesson.durationSeconds) > 0.05 ||
      !Number.isFinite(review.posterTimeSeconds) ||
      review.posterTimeSeconds < 0 ||
      review.posterTimeSeconds >= review.duration ||
      !(await captions.file.text()).startsWith("WEBVTT")
    ) {
      throw new Error(
        `Reviewed master or captions do not match the catalog: ${lesson.id}`,
      );
    }
    return {
      lesson,
      video,
      captions,
      cover,
      review,
      revision: `disposabl-guides:${lesson.id}:en:${new Bun.CryptoHasher("sha256").update(`${video.sha}:${captions.sha}`).digest("hex")}`,
    };
  }),
);
console.log(
  `Verified ${inputs.length} masters, captions and covers (${inputs.reduce((bytes, item) => bytes + item.video.file.size + item.captions.file.size + item.cover.file.size, 0)} bytes).`,
);

async function inputFile(path: string, type: string) {
  const file = Bun.file(path);
  if (!file.size) throw new Error(`Missing or empty source file: ${path}`);
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of file.stream()) hash.update(chunk);
  return { file, type, sha: hash.digest("hex") };
}

async function archive() {
  const endpoint = process.env.R2_ENDPOINT?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Set R2_ENDPOINT, R2_BUCKET_NAME, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.",
    );
  }
  if (
    !/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com\/?$/i.test(
      endpoint,
    ) ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)
  ) {
    throw new Error(
      "Use the Cloudflare account S3 endpoint and the existing R2 bucket name.",
    );
  }
  const r2 = new Bun.S3Client({
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: "auto",
  });
  const archived = [];
  for (const input of inputs) {
    const stem = `disposabl-guides/en/${input.lesson.id}`;
    const [video, captions] = await Promise.all([
      archiveFile(`${stem}-${input.video.sha}.mp4`, input.video),
      archiveFile(`${stem}-${input.captions.sha}.vtt`, input.captions),
      archiveFile(`${stem}-${input.cover.sha}.jpg`, input.cover),
    ]);
    archived.push({ ...input, videoObject: video, captionObject: captions });
    console.log(`Archived and checked: ${input.lesson.id}`);
  }
  return archived;

  async function archiveFile(
    key: string,
    source: Awaited<ReturnType<typeof inputFile>>,
  ) {
    const object = r2.file(key);
    try {
      if (!(await object.exists())) {
        const written = await object.write(source.file, {
          type: source.type,
          retry: 3,
        });
        if (written !== source.file.size)
          throw new Error("Upload size mismatch.");
      }
      const current = await object.stat();
      if (
        current.size !== source.file.size ||
        current.type.split(";")[0] !== source.type
      ) {
        throw new Error("Stored size or type mismatch.");
      }
    } catch (failure) {
      const code = (failure as { code?: string }).code;
      throw new Error(
        `R2 archive check failed for ${key}${code ? ` (${code})` : ""}.`,
      );
    }
    return object;
  }
}

async function installMedia(archived: Awaited<ReturnType<typeof archive>>) {
  const id = process.env.MUX_TOKEN_ID?.trim();
  const secret = process.env.MUX_TOKEN_SECRET?.trim();
  if (!id || !secret)
    throw new Error(
      "Set MUX_TOKEN_ID and MUX_TOKEN_SECRET to import the archived files.",
    );
  const authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  const revisions = new Set(archived.map(({ revision }) => revision));
  const existing = new Map<string, Asset>();
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const page = await api<Asset[]>(`/assets?${params}`);
    for (const asset of page.data) {
      const revision = asset.meta?.external_id ?? asset.passthrough;
      if (!revision || !revisions.has(revision) || asset.status === "errored")
        continue;
      if (existing.get(revision)?.status !== "ready")
        existing.set(revision, asset);
    }
    cursor = page.next_cursor;
  } while (cursor && existing.size < revisions.size);

  const media: Record<string, NonNullable<GuideLesson["video"]>> = {};
  const concurrentImports = 4;
  for (let offset = 0; offset < archived.length; offset += concurrentImports) {
    const batch = await Promise.allSettled(
      archived.slice(offset, offset + concurrentImports).map(importLesson),
    );
    for (const result of batch) {
      if (result.status === "rejected") throw result.reason;
      const [lessonId, lessonMedia] = result.value;
      media[lessonId] = lessonMedia;
    }
  }

  const output =
    mode === "--pilot"
      ? join(finished, "mux-pilot-media.json")
      : resolve(
          import.meta.dir,
          "../../../packages/disposabl-kit/guide-media.json",
        );
  const tmp = `${output}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(media, null, 2) + "\n");
  await rename(tmp, output);
  console.log(
    `Wrote ${Object.keys(media).length} playable entries to ${output}.`,
  );

  async function importLesson({
    lesson,
    videoObject,
    captionObject,
    review,
    revision,
  }: (typeof archived)[number]) {
    const prior = existing.get(revision);
    const captionInput = {
      url: captionObject.presign({ expiresIn: 7200 }),
      type: "text",
      text_type: "subtitles",
      language_code: "en",
      name: "English",
      closed_captions: true,
    };
    const { id: assetId } =
      prior ??
      (
        await api<Asset>("/assets", {
          inputs: [
            {
              url: videoObject.presign({ expiresIn: 7200 }),
              language_code: "en",
            },
            captionInput,
          ],
          playback_policies: ["public"],
          video_quality: "basic",
          passthrough: revision,
          meta: {
            title: `Disposabl Guides · ${lesson.title}`,
            external_id: revision,
          },
        })
      ).data;

    const { asset, captions } = await waitForAsset(
      assetId,
      lesson.id,
      prior && !prior.passthrough ? captionInput : undefined,
    );
    const playbackId = asset.playback_ids?.find(
      (item) => item.policy === "public",
    )?.id;
    if (
      !playbackId ||
      !asset.duration ||
      Math.abs(asset.duration - review.duration) > 1
    ) {
      throw new Error(
        `Mux asset has unexpected playback metadata for ${lesson.id}.`,
      );
    }
    const base = `https://stream.mux.com/${playbackId}`;
    const uri = `${base}.m3u8`;
    const posterUri = `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${review.posterTimeSeconds}&width=540`;
    const captionsUri = `${base}/text/${captions.id}.vtt`;
    await Promise.all([
      verifyText(uri, "#EXTM3U", lesson.id),
      verifyText(captionsUri, "WEBVTT", lesson.id),
      verifyPoster(posterUri, lesson.id),
    ]);
    console.log(`Mux stream, cover and captions checked: ${lesson.id}`);
    return [lesson.id, { uri, posterUri, captionsUri }] as const;
  }

  async function waitForAsset(
    assetId: string,
    lesson: string,
    missingCaption?: object,
  ) {
    const deadline = Date.now() + 360_000;
    const path = `/assets/${encodeURIComponent(assetId)}`;
    do {
      const { data: asset } = await api<Asset>(path);
      const captions = asset.tracks?.find(
        (track) =>
          track.type === "text" &&
          track.text_type === "subtitles" &&
          track.language_code === "en",
      );
      if (asset.status === "errored")
        throw new Error(`Mux import failed for ${lesson} (${assetId}).`);
      if (captions?.status === "errored")
        throw new Error(
          `Mux caption import failed for ${lesson} (${assetId}).`,
        );
      if (
        asset.status === "ready" &&
        captions &&
        captions.status !== "preparing"
      )
        return { asset, captions };
      if (asset.status === "ready" && !captions && missingCaption) {
        await api(`${path}/tracks`, missingCaption);
        missingCaption = undefined;
      }
      await Bun.sleep(3000);
    } while (Date.now() < deadline);
    throw new Error(
      `Mux is still importing ${lesson} (${assetId}). Rerun to check the existing asset.`,
    );
  }

  async function api<T>(path: string, body?: object) {
    const response = await fetch(`https://api.mux.com/video/v1${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(`Mux API ${path} failed (${response.status}).`);
    return (await response.json()) as { data: T; next_cursor?: string };
  }
}

async function verifyText(url: string, prefix: string, lesson: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok || !(await response.text()).trimStart().startsWith(prefix)) {
    throw new Error(
      `Mux did not serve ${prefix} for ${lesson} (${response.status}).`,
    );
  }
}

async function verifyPoster(url: string, lesson: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const type = response.headers.get("content-type");
  await response.body?.cancel();
  if (!response.ok || !type?.startsWith("image/")) {
    throw new Error(
      `Mux did not serve a cover for ${lesson} (${response.status}).`,
    );
  }
}

if (mode !== "--check") {
  const archived = await archive();
  if (mode !== "--archive") await installMedia(archived);
}
