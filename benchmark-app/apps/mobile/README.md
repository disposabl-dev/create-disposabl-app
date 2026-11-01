# Mobile previews and updates

Select `android` in the root `disposabl.json`. After a successful web/backend
deployment, CI computes the Android runtime using Expo's fingerprint policy.
The first run builds an installable APK locally on Boat. Later runs with the
same fingerprint publish EAS Update; native changes produce another APK.

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
`preview` environment for PRs and manual previews, and `production` for `main`.
The web deployment supplies `EXPO_PUBLIC_CONVEX_URL` and
`EXPO_PUBLIC_CONVEX_SITE_URL`. Do not define those two names in a shared EAS
environment: the check fails if they override the current deployment's URLs.
EAS variables with secret visibility are not available to this local build or
update flow; native secrets must be supplied through GitHub Actions.

## Build locally

Install Java 17 and the Android SDK, set `JAVA_HOME` and `ANDROID_HOME`, then:

```sh
DISPOSABL_ANDROID_CHANNEL=ci-benchmark-boat bun run build:android
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

## iOS previews

Select `ios` in `disposabl.json`. A separate macOS 26 job builds locally using EAS
and uploads the archive to the same prerelease as Android and desktop. By default
`DISPOSABL_IOS_TARGET=device` produces a signed internal-distribution IPA. For an
unsigned simulator archive instead, explicitly set the GitHub repository variable
`DISPOSABL_IOS_TARGET=simulator`. A simulator app cannot be installed on an iPhone.

Before device CI, configure remote signing interactively from `apps/mobile`:

```sh
DISPOSABL_MOBILE_CHANNEL=pr-1 bunx eas-cli@27.2.0 credentials --platform ios
```

Use your Apple Developer team and register the intended devices. Provision the
preview bundle identifier from `bunx expo config`: it is the configured
`ios.bundleIdentifier` (or the generated app identifier) plus `.preview`.
All preview IPAs share this identity, so they replace one another on a device;
their embedded update channel and backend still belong to the specific preview.
Production uses the unsuffixed identity and requires separate credentials.
The CI command uses `--freeze-credentials --non-interactive`; it fails if suitable
credentials do not exist instead of creating or modifying them.

The `ios-preview` and `ios-production` profiles use internal distribution. The
simulator profiles use `ios.simulator: true`. They deliberately omit a static
EAS profile channel: dynamic config supplies `DISPOSABL_MOBILE_CHANNEL` (with
`DISPOSABL_ANDROID_CHANNEL` retained for Android compatibility). iOS gets a new
binary for each preview; automated iOS OTA publishing is not implemented here.

To test the simulator build locally with Xcode, CocoaPods and Fastlane installed:

```sh
EAS_ENVIRONMENT=preview DISPOSABL_MOBILE_CHANNEL=ci-benchmark-boat DISPOSABL_IOS_TARGET=simulator bun run build:ios
```

Output is `dist/ios/ios-simulator.tar.gz`, containing a simulator `.app`. Device
output is `dist/ios/ios-device.ipa`. Local EAS builds are published by GitHub; they
do not create hosted EAS Build download records. Every generated app must link
its own Expo project before either mobile lane can run.
