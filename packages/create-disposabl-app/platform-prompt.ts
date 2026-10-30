import { MultiSelectPrompt } from "@clack/core";
import * as p from "@clack/prompts";
import color from "picocolors";
import type { Readable, Writable } from "node:stream";
import { platforms, selectPlatforms } from "./options";

export function createPlatformPrompt(
  streams: {
    input?: Readable;
    output?: Writable;
  } = {},
) {
  return new MultiSelectPrompt({
    ...streams,
    options: platforms.map((option) => ({
      value: option.id,
      label: option.label,
      disabled: option.status !== "available",
      description: "description" in option ? option.description : "",
    })),
    required: false,
    render() {
      // Keep only explicit choices in the prompt's value. Dependencies are
      // derived for display and output, so removing a plugin cannot erase intent.
      const explicit = this.value ?? [];
      const selected = selectPlatforms(
        explicit.length ? explicit.join(",") : "web",
      );
      const title = `${p.symbol(this.state)}  Choose platforms`;
      const bar = color.dim(p.S_BAR);
      if (this.state === "submit") {
        const labels = this.options
          .filter((option) => selected.includes(option.value))
          .map((option) => option.label.trim());
        return `${title}\n${bar}  ${color.dim(labels.join(", ") || "Web only")}`;
      }
      if (this.state === "cancel")
        return `${title}\n${bar}  ${color.dim("Cancelled")}`;
      const style = (
        option: (typeof this.options)[number],
        active: boolean,
      ) => {
        const checked = selected.includes(option.value);
        const hint =
          option.value === "web"
            ? "Required"
            : option.disabled
              ? "Unavailable"
              : option.description +
                (option.value.endsWith("-plugin") ? " · Requires MCP" : "");
        const checkbox = checked
          ? p.S_CHECKBOX_SELECTED
          : active
            ? p.S_CHECKBOX_ACTIVE
            : p.S_CHECKBOX_INACTIVE;
        const label = `${checkbox} ${option.label}`;
        return (
          (option.value === "web"
            ? color.green(label)
            : option.disabled
              ? color.dim(label)
              : active
                ? color.cyan(label)
                : label) + (hint ? color.dim(` (${hint})`) : "")
        );
      };
      // Disabled rows cannot receive the cursor, so keep them outside the
      // scrolling choices where they remain visible even at the top of the list.
      const unavailable = this.options.filter(
        (option) => option.disabled && option.value !== "web",
      );
      const rows = p.limitOptions({
        options: this.options.filter((option) => !unavailable.includes(option)),
        cursor: this.cursor,
        output: streams.output,
        columnPadding: 3,
        rowPadding: 6 + unavailable.length,
        style,
      });

      return [
        title,
        ...rows.map((row) => `${bar}  ${row}`),
        ...unavailable.map((option) => `${bar}  ${style(option, false)}`),
        `${bar}  ${color.dim("↑/↓ move · Space select · Enter confirm")}`,
        color.dim(p.S_BAR_END),
      ].join("\n");
    },
  });
}
