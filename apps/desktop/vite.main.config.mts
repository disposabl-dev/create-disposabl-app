import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    DISPOSABL_UPDATE_URL: JSON.stringify(
      process.env.DISPOSABL_DESKTOP_UPDATE_URL || '',
    ),
    DISPOSABL_UPDATE_CHANNEL: JSON.stringify(
      process.env.DISPOSABL_DESKTOP_UPDATE_CHANNEL || 'production',
    ),
    DISPOSABL_WEB_URL: JSON.stringify(
      process.env.CONVEX_SITE_URL || process.env.VITE_CONVEX_SITE_URL || '',
    ),
  },
});
