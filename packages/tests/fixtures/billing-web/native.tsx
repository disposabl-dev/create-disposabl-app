import React from "react";
const listeners = new Set<(state: string) => void>();
export const AppState = {
  addEventListener: (_: string, fn: (state: string) => void) => {
    listeners.add(fn);
    return { remove: () => listeners.delete(fn) };
  },
};
export function foreground() {
  listeners.forEach((fn) => fn("active"));
}
export const Platform = { OS: "ios" };
export const Text = ({
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>;
export const View = ({
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>;
