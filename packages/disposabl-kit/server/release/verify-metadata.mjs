import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Package metadata must never publish authenticated or signed URLs.
export function verifyMetadata(manifest) {
  function inspect(value, field) {
    if (typeof value === "string") {
      const candidate = value
        .trim()
        .replace(/[\u0000-\u0020]/g, "")
        .replace(/^git\+/i, "");
      if (
        /^[a-z][a-z\d+.-]*:/i.test(candidate) ||
        /^[\\/]{2}/.test(candidate)
      ) {
        let url;
        try {
          url = new URL(
            candidate,
            /^[\\/]{2}/.test(candidate)
              ? "https://metadata.invalid"
              : undefined,
          );
        } catch {
          throw new Error(`Invalid URL in package metadata: ${field}`);
        }
        if (url.username || url.password || url.search || url.hash)
          throw new Error(`Unsafe URL in package metadata: ${field}`);
      } else if (/^[^/]+@[^/]+:/.test(candidate)) {
        throw new Error(`Unsafe URL in package metadata: ${field}`);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item) => inspect(item, field));
    } else if (value && typeof value === "object") {
      for (const item of Object.values(value)) inspect(item, field);
    }
  }
  for (const field of [
    "repository",
    "homepage",
    "bugs",
    "funding",
    "author",
    "contributors",
    "maintainers",
    "publishConfig",
  ])
    inspect(manifest[field], field);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href
)
  try {
    verifyMetadata(
      JSON.parse(readFileSync(process.argv[2] ?? "package.json", "utf8")),
    );
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("Invalid package metadata JSON");
    throw error;
  }
