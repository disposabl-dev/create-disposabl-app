import {
  HeadContent,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";

import site from "../../site.json";
import { isAccountPage } from "@disposabl/disposabl-kit/lib/indexing";

import appCss from "../index.css?url";
import { TelemetryOverrideContext } from "@disposabl/disposabl-kit/client/lib/telemetry";
import { AnalyticsPreference, ProductTelemetry } from "../telemetry";
import { publicReplayPath } from "../telemetry-replay";

export const Route = createRootRoute({
  head: ({ matches }) => {
    const { title, description } = site;
    const pathname = matches[matches.length - 1]?.pathname ?? "/";
    const origin = import.meta.env.VITE_PUBLIC_SITE_URL;
    const url = new URL(pathname, origin).href;
    const image = site.image ? new URL(site.image, origin).href : null;

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "page-type", content: "software" },
        { name: "site-kind", content: "software" },
        { title },
        {
          name: "robots",
          content:
            import.meta.env.PROD &&
            import.meta.env.VITE_SEARCH_INDEXABLE &&
            !isAccountPage(pathname)
              ? "index, follow"
              : "noindex, nofollow",
        },
        { name: "description", content: description },
        { property: "og:site_name", content: site.name },
        { property: "og:locale", content: "en_US" },
        { name: "theme-color", content: "#ffffff" },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        {
          name: "twitter:card",
          content: image ? "summary_large_image" : "summary",
        },
        ...(image
          ? [
              { property: "og:image", content: image },
              { property: "og:image:secure_url", content: image },
              { property: "og:image:type", content: "image/png" },
              { property: "og:image:width", content: "1200" },
              { property: "og:image:height", content: "630" },
              { property: "og:image:alt", content: site.imageAlt },
              { name: "twitter:image", content: image },
              { name: "twitter:image:alt", content: site.imageAlt },
            ]
          : []),
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      scripts:
        pathname === "/"
          ? [
              {
                children:
                  "document.documentElement.classList.add('m-enter');setTimeout(()=>document.documentElement.classList.add('m-enter-done'),700)",
              },
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "WebSite",
                  name: site.name,
                  url,
                  description,
                }).replace(/</g, "\\u003c"),
              },
            ]
          : [],
      links: [
        { rel: "canonical", href: url },
        { rel: "icon", href: "/disposabl-logo.svg" },
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
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  return (
    <html lang="en" data-type="software" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        data-replay-public={publicReplayPath(pathname) ? "true" : undefined}
      >
        <TelemetryOverrideContext.Provider value={ProductTelemetry}>
          {children}
          <AnalyticsPreference />
        </TelemetryOverrideContext.Provider>
        <Scripts />
      </body>
    </html>
  );
}
