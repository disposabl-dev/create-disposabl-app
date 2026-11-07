import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import press from "fumapress/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";

export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [press({ basePath: "/docs/" }), fumadocsMdx(), tailwindcss()],
});
