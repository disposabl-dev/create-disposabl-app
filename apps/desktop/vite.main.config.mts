import { defineConfig } from 'vite';
import manifest from './package.json' with { type: 'json' };
import { configuredWebsite } from './website-config';

export default defineConfig({
  define: {
    DISPOSABL_DESKTOP_ID: JSON.stringify(
      'disposablDesktopId' in manifest ? manifest.disposablDesktopId : '',
    ),
    DISPOSABL_UPDATE_URL: JSON.stringify(
      process.env.DISPOSABL_DESKTOP_UPDATE_URL || '',
    ),
    DISPOSABL_UPDATE_CHANNEL: JSON.stringify(
      process.env.DISPOSABL_DESKTOP_UPDATE_CHANNEL || 'production',
    ),
    DISPOSABL_WEB_URL: JSON.stringify(configuredWebsite()),
  },
});
