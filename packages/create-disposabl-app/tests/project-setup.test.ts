import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { setupTable } from "../project-setup";
import { selectPlatforms } from "../options";

test("setup values wrap within narrow terminals while installation time remains visible", () => {
  const table = stripVTControlCharacters(
    setupTable(
      "example",
      {
        version: "0.1.0",
        platforms: selectPlatforms(
          "android,ios,windows,linux,macos,openai-plugin,claude-code-plugin",
        ),
        features: ["authentication"],
      },
      { installation: "Installing", elapsedSeconds: 12.34 },
      50,
    ),
  );
  expect(table).toContain("Installing (12.34s)");
  expect(table.split("\n").every((line) => line.length < 50)).toBe(true);
  expect(table.replace(/[│\s]+/g, " ")).toContain("OpenAI Plugin");
});
