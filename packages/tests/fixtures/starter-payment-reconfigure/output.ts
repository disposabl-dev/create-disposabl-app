import { mkdir, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export async function createOutputDirectory(requested: string) {
  if (!isAbsolute(requested)) throw new Error("Output path must be absolute.");
  const temporaryRoot = await realpath("/tmp");
  const parent = await realpath(dirname(resolve(requested)));
  const within = relative(temporaryRoot, parent);
  if (isAbsolute(within) || within === ".." || within.startsWith(`..${sep}`))
    throw new Error("Output parent must resolve within /tmp.");
  const output = join(parent, basename(resolve(requested)));
  await mkdir(output, { recursive: false });
  return output;
}
