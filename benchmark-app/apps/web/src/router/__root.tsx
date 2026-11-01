import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import appCss from "../index.css?url";

export const Route = createRootRoute({
  head: ({ matches }) => {
    const title = "Disposabl";
    const description =
      "A starter kit for web and mobile apps built with TanStack Start, Expo, and Convex.";
    const pathname = matches[matches.length - 1]?.pathname ?? "/";
    const url = new URL(pathname, import.meta.env.VITE_CONVEX_SITE_URL).href;

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title },
        {
          name: "robots",
          content:
            import.meta.env.MODE === "production"
              ? "index, follow"
              : "noindex, nofollow",
        },
        { name: "description", content: description },
        { property: "og:site_name", content: title },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [
        { rel: "canonical", href: url },
        { rel: "icon", href: "/favicon.ico?v=1" },
        { rel: "stylesheet", href: appCss },
      ],
    };
  },
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
