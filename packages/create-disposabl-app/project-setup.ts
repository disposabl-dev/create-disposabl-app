import { clearScreenDown, cursorTo, moveCursor } from "node:readline";
import color from "picocolors";
import { performance } from "node:perf_hooks";
import { features, platforms, type DisposablConfig } from "./options";

type Status = {
  installation:
    | "Not started"
    | "Pending"
    | "Complete"
    | "Failed"
    | "Skipped"
    | "Installing";
  elapsedSeconds?: number;
};

export function setupTable(
  name: string,
  config: DisposablConfig,
  status: Status,
  columns = 80,
) {
  const installation =
    status.installation +
    (status.elapsedSeconds === undefined
      ? ""
      : ` (${status.elapsedSeconds.toFixed(2)}s)`);
  const rows = [
    ["App", name],
    ["Disposabl Version", config.version],
    [
      "Platforms",
      config.platforms
        .map((id) => platforms.find((p) => p.id === id)!.label)
        .join(", "),
    ],
    [
      "Features",
      config.features
        .map((id) => features.find((f) => f.id === id)!.label)
        .join(", ") || "None",
    ],
    ["Installation", installation],
  ];
  const labelWidth = Math.max(...rows.map(([label]) => label!.length));
  const padding = labelWidth + 7;
  const contentWidth = Math.max(
    46,
    ...rows.map(([, value]) => value!.length + padding),
  );
  const width = Math.max(24, Math.min(columns - 1, 80, contentWidth));
  const valueWidth = width - padding;
  const border = color.dim("─".repeat(width - 2));
  const result = [color.bold("App Setup"), `┌${border}┐`];
  for (const [label, value] of rows) {
    let remaining = value!;
    let first = true;
    do {
      let end = valueWidth;
      if (remaining.length > end) {
        const space = remaining.lastIndexOf(" ", end);
        if (space > 0) end = space;
      }
      const part = remaining.slice(0, end);
      remaining = remaining.slice(end).trimStart();
      const cell = part.padEnd(valueWidth);
      const isStatus = label === "Installation";
      const styled =
        isStatus && status.installation === "Complete"
          ? color.green(cell)
          : isStatus && status.installation === "Failed"
            ? color.red(cell)
            : label === "App"
              ? color.bold(cell)
              : cell;
      result.push(
        `│ ${(first ? label! : "").padEnd(labelWidth)} │ ${styled} │`,
      );
      first = false;
    } while (remaining);
  }
  result.push(`└${border}┘`);
  return result.join("\n");
}

export function projectSetup(name: string, config: DisposablConfig) {
  const live = Boolean(process.stdout.isTTY);
  const status: Status = { installation: "Pending" };
  let lines = 0;
  let started: number | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  function render() {
    if (live && lines) {
      moveCursor(process.stdout, 0, -lines);
      cursorTo(process.stdout, 0);
      clearScreenDown(process.stdout);
    }
    const frame = setupTable(name, config, status, process.stdout.columns);
    process.stdout.write(frame + "\n");
    lines = frame.split("\n").length;
  }
  if (live) render();
  return {
    live,
    installing() {
      started = performance.now();
      status.installation = "Installing";
      const tick = () => {
        status.elapsedSeconds = (performance.now() - started!) / 1000;
        if (live) render();
      };
      tick();
      if (live) timer = setInterval(tick, 100);
    },
    finish(next: Partial<Status>) {
      clearInterval(timer);
      Object.assign(status, next);
      if (started !== undefined)
        status.elapsedSeconds = (performance.now() - started) / 1000;
      render();
    },
  };
}
