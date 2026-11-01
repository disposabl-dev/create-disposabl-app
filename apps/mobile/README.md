# Mobile previews and updates

Mobile previews are release builds with embedded JavaScript, not development
clients. Android uses `assembleRelease`; iOS internal profiles explicitly disable
`developmentClient`. They run without Metro or Expo Go and use EAS Update for
compatible changes.

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
The backend deployment supplies the same URLs to web and mobile:
`CONVEX_URL` is the client API origin and `CONVEX_SITE_URL` is the HTTP/auth origin.
CI exports this pair once, generating the `VITE_` and `EXPO_PUBLIC_` aliases
for web builds, mobile fingerprinting, APK builds and EAS Update exports.
Turbo includes the web aliases in build cache keys. Saved EAS aliases are ignored;
conflicting canonical URLs fail the build. Each PR uses its own deployed backend.
EAS variables with secret visibility are not available to this local build or
update flow; native secrets must be supplied through GitHub Actions.

## Build locally

Install Java 17 and the Android SDK, set `JAVA_HOME` and `ANDROID_HOME`, then:

```sh
DISPOSABL_MOBILE_CHANNEL=development bunx expo run:android --variant release
```

This is a release-mode build with its JavaScript bundled, so it runs without
Metro. Preview APKs use Expo's public debug signing key and a separate application
ID. CI's prebuild, Gradle build, caching and embedded fingerprint checks live
directly in `.github/workflows/pipeline.yml`; there is no Android build helper.

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
production. The Web runner publishes Android directly after its build or update,
without waiting for desktop. Each PR reuses its Android release, normally
`app-pr-N-android`, replacing the APK/metadata and moving the tag to the tested
commit. Only a published APK with matching metadata and digest is reusable.
The job has `contents: write`; fork PRs never deploy or publish. There is no
intermediate Actions artifact. This workflow does not submit to Google Play or
the App Store.

The mobile UI is still the starter screen. Backend URLs are available to mobile
code through `process.env.EXPO_PUBLIC_CONVEX_URL` and
`process.env.EXPO_PUBLIC_CONVEX_SITE_URL`; mobile authentication is not added by
the distribution workflow.

## iOS

When iOS is enabled and affected, the Web + Android runner checks the latest
published iOS release for the same channel, project, bundle ID and runtime.
A matching IPA with a verified GitHub digest and unexpired provisioning profile
uses EAS Update. Otherwise, when `IOS_BUILD_ENABLED=true`, a Blacksmith macOS runner
performs an EAS local release build using the remote signing credentials, then
publishes its own iOS release.
That runner starts only when a new IPA is needed, after Web + Android finishes.

Each PR needs its own initial IPA because its channel is embedded in the app.
CI sets the EAS profile channel from the workflow's `CHANNEL`, verifies the IPA's
signature, bundle ID, embedded runtime and channel, and records its profile expiry.
Install the IPA on a registered iPhone; subsequent compatible changes use EAS
Update. Local builds are tracked by their GitHub release metadata, not EAS cloud
build history. Native builds take longer than the update-only path.

Internal distribution needs Apple signing credentials and registered devices.
After configuring the project's EAS ad hoc credentials, set the GitHub repository
variable `IOS_BUILD_ENABLED=true`. Until then, CI reports the missing initial IPA
and avoids allocating a macOS runner that cannot sign it.
After adding test devices, refresh the EAS ad hoc profile and bump the repository
variable `IOS_BUILD_REVISION` to rebuild existing PR IPAs even if native code is unchanged.
It does not require TestFlight or an App Store Connect app record. TestFlight is
a separate distribution option. The pipeline never submits to the App Store.
