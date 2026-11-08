import { existsSync, mkdtempSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Prebuild must start without an Android project: updating one in place can
// retain old intent filters, update metadata, or E2E dev-client settings.
export function freshAndroid(mobile, prebuild) {
  const android = join(mobile, "android");
  const saved = mkdtempSync(join(tmpdir(), "disposabl-play-native-"));
  const previous = join(saved, "android");
  const hadPrevious = existsSync(android);
  if (hadPrevious) renameSync(android, previous);
  console.error(`Preserved native build files: ${saved}`);
  try {
    prebuild();
    if (!existsSync(join(android, "app/build.gradle")))
      throw new Error("Prebuild did not create an Android app");
  } catch (error) {
    if (existsSync(android)) renameSync(android, join(saved, "failed-android"));
    if (hadPrevious) renameSync(previous, android);
    throw error;
  }
  return saved;
}
