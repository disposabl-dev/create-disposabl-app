import { expect, test } from "bun:test";
import { nextVersion } from "../release";

test("increments the latest patch when the requested version is already used", () => {
  expect(nextVersion("0.1.0", ["0.1.0", "0.1.1"])).toBe("0.1.2");
});
