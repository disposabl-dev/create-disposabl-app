import { resolve } from 'node:path';
import manifest from './package.json' with { type: 'json' };
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { desktopAuthScheme } from '../../packages/disposabl-kit/lib/desktop-auth';
import { externalUrl } from './src/navigation';
import { configuredWebsite } from './website-config';

const executableName = manifest.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
const authScheme = desktopAuthScheme(
  'disposablDesktopId' in manifest ? manifest.disposablDesktopId : null,
);
const mimeType = authScheme ? [`x-scheme-handler/${authScheme}`] : [];

// specTemplate is supported by electron-installer-redhat but absent from Forge's types.
const rpmOptions = {
  name: executableName,
  bin: executableName,
  specTemplate: resolve('rpm.spec.ejs'),
  mimeType,
};

const signedRelease =
  process.platform === 'darwin' && process.env.MACOS_NOTARIZE === 'true';
if (
  signedRelease &&
  (!process.env.APPLE_API_KEY ||
    !process.env.APPLE_API_KEY_ID ||
    !process.env.APPLE_API_ISSUER ||
    !process.env.MACOS_SIGNING_IDENTITY ||
    !process.env.MACOS_KEYCHAIN)
)
  throw new Error('macOS releases require Apple notarization credentials');

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName,
    ...(authScheme
      ? { protocols: [{ name: manifest.productName, schemes: [authScheme] }] }
      : {}),
    icon: 'src/assets/icon',
    appBundleId:
      process.env.MACOS_BUNDLE_ID ||
      ('disposablDesktopId' in manifest
        ? `dev.disposabl.app.d${manifest.disposablDesktopId}`
        : 'dev.disposabl.starter.desktop'),
    ...(process.platform === 'darwin'
      ? {
          osxSign: signedRelease
            ? {
                identity: process.env.MACOS_SIGNING_IDENTITY!,
                keychain: process.env.MACOS_KEYCHAIN!,
              }
            : {
                identity: '-',
                identityValidation: false,
                optionsForFile: () => ({
                  hardenedRuntime: false,
                  timestamp: 'none',
                }),
              },
        }
      : {}),
    ...(signedRelease
      ? {
          osxNotarize: {
            appleApiKey: process.env.APPLE_API_KEY!,
            appleApiKeyId: process.env.APPLE_API_KEY_ID!,
            appleApiIssuer: process.env.APPLE_API_ISSUER!,
          },
        }
      : {}),
    download: {
      cacheRoot: process.env.electron_config_cache,
    },
  },
  rebuildConfig: {},
  hooks: {
    prePackage: async (_config, platform, arch) => {
      const website = configuredWebsite();
      if (website && (!website.startsWith('https://') || !externalUrl(website)))
        throw new Error(
          'Desktop packaging requires a valid HTTPS website without credentials. Set CONVEX_SITE_URL or VITE_CONVEX_SITE_URL, or leave both blank for the starter.',
        );
      const supported =
        (platform === 'darwin' && arch === 'arm64') ||
        ((platform === 'win32' || platform === 'linux') && arch === 'x64');

      if (!supported) {
        throw new Error(
          `Unsupported desktop target ${platform}/${arch}. Use Windows x64, Linux x64, or macOS arm64.`,
        );
      }
    },
  },
  makers: [
    new MakerSquirrel({ setupIcon: 'src/assets/icon.ico' }),
    new MakerZIP({}, ['darwin']),
    // The HFS+ volume title is limited; keep app and artifact names unchanged.
    new MakerDMG({ format: 'ULFO', title: 'Install' }),
    new MakerRpm({ options: rpmOptions }),
    new MakerDeb({
      options: { name: executableName, bin: executableName, mimeType },
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
