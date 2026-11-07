import { AwsClient } from "aws4fetch";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export type R2Config = {
  account: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
};
export type Location =
  | { provider: "convex"; storageId: string }
  | { provider: "r2"; key: string; account: string; bucket: string };

export function r2Config(
  env: Record<string, string | undefined>,
): R2Config | null {
  const [account, bucket, accessKey, secretKey] = [
    env.R2_ACCOUNT_ID,
    env.R2_BUCKET_NAME,
    env.R2_ACCESS_KEY_ID,
    env.R2_SECRET_ACCESS_KEY,
  ].map((s) => s?.trim());
  return account && bucket && accessKey && secretKey
    ? { account, bucket, accessKey, secretKey }
    : null;
}

export function validateUpload(
  filename: string,
  mediaType: string,
  bytes: ArrayBuffer,
) {
  if (!filename.trim() || filename.length > 255)
    throw new Error("A file name up to 255 characters is required.");
  if (
    mediaType.length > 255 ||
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mediaType)
  )
    throw new Error("A valid file media type is required.");
  if (!bytes.byteLength || bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new Error("File must be nonempty and at most 5 MiB.");
}

export function requireOwner<T extends { owner: string }>(
  file: T | null,
  owner: string,
): T {
  if (!file || file.owner !== owner) throw new Error("File not found.");
  return file;
}

function r2Client(
  location: Extract<Location, { provider: "r2" }>,
  env: Record<string, string | undefined>,
) {
  const config = r2Config(env);
  if (
    !config ||
    config.account !== location.account ||
    config.bucket !== location.bucket
  )
    throw new Error(
      "R2 access configuration for this file is missing or changed.",
    );
  const client = new AwsClient({
    accessKeyId: config.accessKey,
    secretAccessKey: config.secretKey,
    service: "s3",
    region: "auto",
  });
  const url = `https://${config.account}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}/${encodeURIComponent(location.key)}`;
  return { client, url };
}

export async function r2Write(
  location: Extract<Location, { provider: "r2" }>,
  env: Record<string, string | undefined>,
  bytes: ArrayBuffer,
  mediaType: string,
) {
  const { client, url } = r2Client(location, env);
  const response = await client.fetch(url, {
    method: "PUT",
    body: bytes,
    headers: { "Content-Type": mediaType },
  });
  if (!response.ok) throw new Error(`R2 upload failed (${response.status}).`);
}
export async function r2Delete(
  location: Extract<Location, { provider: "r2" }>,
  env: Record<string, string | undefined>,
) {
  const { client, url } = r2Client(location, env);
  const response = await client.fetch(url, { method: "DELETE" });
  if (!response.ok) throw new Error(`R2 delete failed (${response.status}).`);
}
export async function r2Url(
  location: Extract<Location, { provider: "r2" }>,
  env: Record<string, string | undefined>,
) {
  const { client, url } = r2Client(location, env);
  return (
    await client.sign(`${url}?X-Amz-Expires=300`, { aws: { signQuery: true } })
  ).url;
}

export async function registerWithRollback<T>(
  write: () => Promise<T>,
  register: (location: T) => Promise<unknown>,
  remove: (location: T) => Promise<void>,
) {
  const location = await write();
  try {
    return await register(location);
  } catch (error) {
    try {
      await remove(location);
    } catch {
      throw new Error(
        "File registration failed and storage cleanup failed; manual cleanup may be required.",
        { cause: error },
      );
    }
    throw error;
  }
}
export async function deleteThenForget(
  remove: () => Promise<void>,
  forget: () => Promise<void>,
) {
  await remove();
  await forget();
}
