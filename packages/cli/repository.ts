import { createHash, randomUUID } from "node:crypto";
import { mkdir, chmod, writeFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Save outside the repository. The CLI prints only the path, never the token. */
export async function configureRepository(
  origin: string,
  appId: string,
  value: { token: string; repository: string },
) {
  if (
    !value.token ||
    !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(value.repository)
  )
    throw new Error("Invalid repository credential response.");
  const directory =
    process.env.DISPOSABL_CONFIG_DIR || join(homedir(), ".config", "disposabl");
  const key = createHash("sha256")
    .update(JSON.stringify([origin, appId]))
    .digest("hex");
  const credentialFile = join(directory, `repository-${key}.json`);
  const temporary = `${credentialFile}.${randomUUID()}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  try {
    await writeFile(temporary, JSON.stringify(value), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, credentialFile);
  } finally {
    await rm(temporary, { force: true });
  }
  return { repository: value.repository, credentialFile };
}
