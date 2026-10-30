import { expect, test } from "bun:test";
import { PassThrough, Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { createPlatformPrompt } from "../platform-prompt";
import { selectPlatforms, type Platform } from "../options";

test("the initial 80x24 picker shows unavailable SDKs and descriptive plugin hints", async () => {
  const input = new PassThrough();
  let rendered = "";
  const output = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        rendered += chunk.toString();
        done();
      },
    }),
    { columns: 80, rows: 24 },
  );
  const prompt = createPlatformPrompt({ input, output });
  const completion = prompt.prompt();
  try {
    const frame = stripVTControlCharacters(rendered);
    expect(frame).toContain("Python SDK (Unavailable)");
    expect(frame).toContain("TypeScript SDK (Unavailable)");
    expect(frame).toContain("MCP (Tools for AI assistants)");
    expect(frame).toContain(
      "OpenAI Plugin (Tools and skills for OpenAI · Requires MCP)",
    );
    expect(frame).toContain(
      "Claude Code Plugin (Tools and skills for Claude Code · Requires MCP)",
    );
    expect(frame.match(/Requires MCP/g)).toHaveLength(2);
    expect(frame).not.toContain("Required by plugins");
    expect(frame.split("\n").length).toBeLessThanOrEqual(24);
    for (const id of ["python-sdk", "typescript-sdk"]) {
      expect(
        prompt.options.find((option) => option.value === id)!.disabled,
      ).toBe(true);
    }
  } finally {
    input.write("\x03");
    await completion;
    input.destroy();
    output.destroy();
  }
});

function picker() {
  const prompt = createPlatformPrompt();
  return {
    toggle(platform: Platform) {
      prompt.cursor = prompt.options.findIndex(
        (option) => option.value === platform,
      );
      prompt.emit("cursor", "space");
    },
    selected() {
      return selectPlatforms(
        prompt.value?.length ? prompt.value.join(",") : "web",
      );
    },
  };
}

test("Web is visible, required, and selected by default", () => {
  const prompt = createPlatformPrompt();
  expect(prompt.options[0]).toMatchObject({
    value: "web",
    label: "Web",
    disabled: true,
  });
  expect(selectPlatforms()).toEqual(["web"]);
  expect(prompt.options[prompt.cursor]!.disabled).toBe(false);
  expect(prompt.options.find((option) => option.value === "linux")!.label).toBe(
    "Linux",
  );
});

for (const plugin of ["openai-plugin", "claude-code-plugin"] as const) {
  test(`${plugin} adds MCP temporarily when MCP was not selected`, () => {
    const p = picker();
    p.toggle(plugin);
    expect(p.selected()).toEqual(["web", "mcp", plugin]);
    p.toggle(plugin);
    expect(p.selected()).toEqual(["web"]);
  });

  test(`explicit MCP survives selecting and deselecting ${plugin}`, () => {
    const p = picker();
    p.toggle("mcp");
    p.toggle(plugin);
    p.toggle(plugin);
    expect(p.selected()).toEqual(["web", "mcp"]);
  });
}

test("MCP stays until the last plugin is deselected", () => {
  const p = picker();
  p.toggle("openai-plugin");
  p.toggle("claude-code-plugin");
  p.toggle("openai-plugin");
  expect(p.selected()).toEqual(["web", "mcp", "claude-code-plugin"]);
  p.toggle("claude-code-plugin");
  expect(p.selected()).toEqual(["web"]);
});

test("users can explicitly keep automatically enabled MCP", () => {
  const p = picker();
  p.toggle("claude-code-plugin");
  p.toggle("mcp");
  p.toggle("claude-code-plugin");
  expect(p.selected()).toEqual(["web", "mcp"]);
});

test("clearing explicit MCP keeps it while a plugin requires it", () => {
  const p = picker();
  p.toggle("mcp");
  p.toggle("openai-plugin");
  p.toggle("mcp");
  expect(p.selected()).toEqual(["web", "mcp", "openai-plugin"]);
  p.toggle("openai-plugin");
  expect(p.selected()).toEqual(["web"]);
});
