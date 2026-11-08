export const marketingPages = {
  "/pricing": {
    title: "Pricing | Disposabl",
    description: "Build locally for free or explore Agent Mode credit options.",
  },
  "/stack": {
    title: "App development tech stack | Disposabl",
    description:
      "Choose platforms and explore the tools, shared backend, and release workflows included in a Disposabl project.",
  },
  "/build": {
    title: "How to build with Disposabl | Disposabl",
    description:
      "See how to create a project, work with your coding agent, test a preview, and prepare your app for release.",
  },
  "/why-disposabl": {
    title: "Why use Disposabl with Claude Code or Codex?",
    description:
      "Explore the connected interfaces, backend, tests, and release workflows Disposabl sets up for your coding agent.",
  },
};

export function marketingHead(pathname: keyof typeof marketingPages) {
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
