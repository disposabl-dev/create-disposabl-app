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
  let previous: string[] = [];
  let columns = process.stdout.columns;
  let started: number | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  function render() {
    const frame = setupTable(
      name,
      config,
      status,
      process.stdout.columns,
    ).split("\n");
    if (
      live &&
      previous.length === frame.length &&
      columns === process.stdout.columns
    ) {
      let update = "";
      for (let row = 0; row < frame.length; row++) {
        const before = previous[row]!;
        const after = frame[row]!;
        if (before === after) continue;
        let start = 0;
        let end = after.length;
        // Timer rows are unstyled and fixed-width: overwrite only changed digits.
        if (
          before.length === after.length &&
          !before.includes("\x1b") &&
          !after.includes("\x1b")
        ) {
          while (start < end && before[start] === after[start]) start++;
          while (end > start && before[end - 1] === after[end - 1]) end--;
        }
        const distance = frame.length - row;
        update += `\x1b[${distance}A\x1b[${start + 1}G`;
        if (start === 0) update += "\x1b[2K";
        update += after.slice(start, end);
        update += `\x1b[${distance}B\x1b[1G`;
      }
      if (update) process.stdout.write(update);
      previous = frame;
      return;
    }
    if (live && previous.length) {
      moveCursor(process.stdout, 0, -previous.length);
      cursorTo(process.stdout, 0);
      clearScreenDown(process.stdout);
    }
    process.stdout.write(frame.join("\n") + "\n");
    previous = frame;
    columns = process.stdout.columns;
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
