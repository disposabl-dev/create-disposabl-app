import { mkdirSync, realpathSync, statfsSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

/** Preserve evidence explicitly; never accumulate unnamed stages or delete old runs. */
export function reserveSdkArtifacts(
  requested = process.env.E2E_SDK_ARTIFACT_DIR,
) {
  if (!requested || !isAbsolute(requested))
    throw new Error(
      "Set E2E_SDK_ARTIFACT_DIR to an unused absolute path under /tmp",
    );
  const temporary = realpathSync("/tmp");
  const parent = realpathSync(dirname(resolve(requested)));
  const part = relative(temporary, parent);
  if (isAbsolute(part) || part === ".." || part.startsWith(`..${sep}`))
    throw new Error("SDK artifacts must remain under /tmp");
  const disk = statfsSync(parent);
  if (disk.bavail * disk.bsize < 2 * 1024 ** 3)
    throw new Error(
      "SDK qualification requires at least 2 GiB free; retained evidence was not removed",
    );
  const stage = join(parent, basename(resolve(requested)));
  mkdirSync(stage, { mode: 0o700 });
  return stage;
}
