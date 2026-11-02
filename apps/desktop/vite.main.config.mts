import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    DISPOSABL_WEB_URL: JSON.stringify(
      process.env.CONVEX_SITE_URL || process.env.VITE_CONVEX_SITE_URL || '',
    ),
  },
});
