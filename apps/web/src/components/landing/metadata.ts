export const marketingPages: Record<
  string,
  { title: string; description: string }
> = {
  "/stack": {
    title: "The stack behind your app | Disposabl",
    description:
      "Explore the TypeScript foundation for web, mobile, desktop, API, CLI, SDK, and MCP apps. Know what you own and how the pieces fit.",
  },
  "/build": {
    title: "From first command to a real app | Disposabl",
    description:
      "A practical guide to setup, local previews, native builds, tests, publishing, and sandbox Agent Mode. Understand each step and its tradeoffs.",
  },
  "/why-disposabl": {
    title: "Your coding agent, with a connected foundation | Disposabl",
    description:
      "Why use Disposabl with Claude Code, Codex, or Cursor? Start with platform setup, a shared backend, tests, and release workflows you can change.",
  },
};

export function marketingHead(pathname: string) {
  const { title, description } = marketingPages[pathname];
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
  };
}
