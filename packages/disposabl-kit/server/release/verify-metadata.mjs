import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Package metadata must never publish authenticated or signed URLs.
export function verifyMetadata(manifest) {
  function inspect(value, field) {
    if (typeof value === "string") {
      const candidate = value.replace(/^git\+/, "");
      if (/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) {
        let url;
        try {
          url = new URL(candidate);
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
      for (const [key, item] of Object.entries(value))
        inspect(item, `${field}.${key}`);
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
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  verifyMetadata(JSON.parse(readFileSync("package.json", "utf8")));
