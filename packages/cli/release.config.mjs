import { readFileSync } from "node:fs";
import { clientRelease } from "../disposabl-kit/server/release/clients.mjs";
const { name } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
export default clientRelease(name);
