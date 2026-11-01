# Mobile previews and updates

Select `android` in the root `disposabl.json`. When mobile or shared dependencies
change, CI computes the Expo fingerprint in the Web job after web/backend
deployment, reusing its runner and dependency install. The first run builds an
installable APK on that same 4-vCPU runner. Later runs with the same fingerprint
publish EAS Update there; native changes build another APK without another
checkout or dependency install. Linux and Windows build alongside this job.
All CI jobs run on Blacksmith. See [.github/README.md](../../.github/README.md)
for the job order and cache behavior.

Each PR uses its own `pr-<number>` channel and Android application ID. Production
uses `production`. A new PR needs its own first APK even when another PR has the
same native dependencies. Install that APK once; compatible JavaScript and asset
updates download on launch and normally apply on the following cold launch.

The last published APK is the baseline. Failed builds and partial uploads do
not advance it. A missing APK forces another build. Reverting a native change
also builds again, so users do not need to downgrade an older APK. An API or
authentication error fails CI rather than being interpreted as a missing build.

## Link an Expo project

Each generated app needs its own Expo project. From `apps/mobile`, run:

```sh
bunx eas-cli@27.2.0 init
bunx eas-cli@27.2.0 update:configure --platform android --environment preview
```

For dynamic app config, the CLI may ask you to add the returned project ID.
The starter accepts `EXPO_PROJECT_ID`, `EXPO_OWNER`, and `EXPO_SLUG` in local
`.env.local` and as GitHub repository variables. It also accepts a committed
`extra.eas.projectId` and `owner` in `app.json`. `app.config.js` supplies the
fingerprint runtime policy and channel header for local Gradle builds, following
[Expo's standalone EAS Update setup](https://docs.expo.dev/eas-update/standalone-service/).
Do not commit local credentials or reuse the generator maintainer's Expo project.

Set these GitHub repository variables to the project returned by the CLI:

- `EXPO_PROJECT_ID`
- `EXPO_OWNER`
- `EXPO_SLUG`

Add an Expo access token as the `EXPO_TOKEN` GitHub secret. CI loads the EAS
`preview` environment for PRs, and `production` for `main`.
The web deployment supplies `EXPO_PUBLIC_CONVEX_URL` and
`EXPO_PUBLIC_CONVEX_SITE_URL`. Do not define those two names in a shared EAS
environment: the check fails if they override the current deployment's URLs.
EAS variables with secret visibility are not available to this local build or
update flow; native secrets must be supplied through GitHub Actions.

## Build locally

Install Java 17 and the Android SDK, set `JAVA_HOME` and `ANDROID_HOME`, then:

```sh
DISPOSABL_ANDROID_CHANNEL=development bun run build:android
```

The output is `dist/android/app.apk`. It is a release-mode build with its
JavaScript bundled, so it runs without Metro. Preview APKs use Expo's public
debug signing key and a separate application ID. The build checks the runtime
fingerprint embedded in the APK before accepting it.

For a faster local emulator check, set
`DISPOSABL_ANDROID_ARCHITECTURES=arm64-v8a` on an ARM emulator, or `x86_64` on an
Intel emulator. CI leaves this unset to build the template's default ABIs.

## Production

Production builds require a persistent keystore. Add these GitHub secrets:

- `ANDROID_KEYSTORE_BASE64`: base64-encoded keystore file
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Keep the same key for later versions. CI writes it to a temporary file and
removes it after building. The version code comes from the workflow run number;
preserve increasing numbers if moving this workflow to another repository.
An OTA update does not require the signing key because it does not build an APK.

Native builds publish GitHub prereleases for previews and releases for
production. A draft becomes the successful fingerprint baseline only after its
APK upload completes. The release job needs `contents: write`, scoped to the
final aggregate publisher. Fork PRs never run this job. GitHub Actions keeps a one-day build
artifact; the release holds the durable download. This workflow does not submit
to Google Play or the App Store.

The mobile UI is still the starter screen. Backend URLs are available to mobile
code through `process.env.EXPO_PUBLIC_CONVEX_URL` and
`process.env.EXPO_PUBLIC_CONVEX_SITE_URL`; mobile authentication is not added by
the distribution workflow.

## iOS

CI intentionally skips iOS, including fingerprint checks and EAS Update, even
when `ios` appears in `disposabl.json`. No Apple runner is started.

The local `build:ios` command and internal-distribution EAS profiles remain for
future work. Signed iPhone builds need Apple signing credentials and registered
devices. TestFlight is an alternative distribution method and needs an App Store
Connect app record. Neither is configured or verified by the current pipeline.
