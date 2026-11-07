import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import site from "../../../apps/web/site.json";

test(
  "social metadata is available without JavaScript",
  { platforms: ["web"], tags: ["seo"] },
  async ({ app }) => {
    const response = await fetch(new URL("/", app.baseUrl));
    expect(response.status).toBe(200);
    const head = (await response.text()).split("</head>")[0];
    expect(head).toContain(
      `property="og:title" content="${site.title.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}"`,
    );
    if (site.origin)
      expect(head).toContain(`rel="canonical" href="${site.origin}/"`);
    if (site.image) {
      expect(head).toContain(
        'name="twitter:card" content="summary_large_image"',
      );
      expect(head).toContain(
        `property="og:image" content="${site.origin}${site.image}"`,
      );
      const image = await fetch(new URL(site.image, app.baseUrl));
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toContain("image/png");
      const bytes = new DataView(await image.arrayBuffer());
      expect(bytes.getUint32(16)).toBe(1200);
      expect(bytes.getUint32(20)).toBe(630);
    }
    const login = await fetch(new URL("/login", app.baseUrl));
    expect((await login.text()).split("</head>")[0]).toContain(
      'name="robots" content="noindex, nofollow"',
    );
  },
);
