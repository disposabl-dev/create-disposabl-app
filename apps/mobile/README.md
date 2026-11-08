# Mobile previews and updates

## Local development and authentication

Mobile uses the same Convex Auth v2 username/password accounts as the website.
`@disposabl/disposabl-kit/mobile` owns the provider, signup/login forms, session
storage, route guards, and account screen. Files in `src/app/` only re-export
these reusable screens and layouts. Add custom app screens alongside them.

Routes outside `(authenticated)` are public. Put screens that require login
under `src/app/(authenticated)/`; its shared layout guards every descendant,
including direct links. The `(auth)` group contains login and signup. Successful
login opens the account screen, where `users.index.current` returns the caller's
username and user ID from Convex. Logout clears the session and returns home.
Expo SecureStore persists tokens per deployment across app restarts.

Include `"authentication"` in root `disposabl.json` features to enable frontend
auth. The generator omits login, signup, consent, and auth-dependent sample
screens when this feature is not selected. Missing routes return not found;
they do not redirect home. Mobile gets a public home and route-group layout.
The root provider selects Convex with or without auth; individual screens do
not check the feature flag. Backend authentication and its access checks remain
installed and enforced. Removing auth from an existing app also means deleting
its auth routes and replacing any auth-dependent UI, as the generator does for
new apps. Rebuild preview/release apps after changing routes or features.

Expo autolinking deduplicates React, Convex, and Convex Auth between the app and
kit so native screens use the app's React version and a single auth context.
The kit's Expo config plugin adds workspace sources, the feature list, and public
backend URL inputs to Android release bundling, so Gradle rebuilds the embedded
JavaScript after shared kit or configuration changes.

For a new worktree, install dependencies with `bun install`, then select an
isolated Convex dev deployment. Substitute your own team, project, and branch:

```sh
cd packages/backend
bunx convex deployment create YOUR_TEAM:YOUR_PROJECT:dev/YOUR_BRANCH --type dev --select
bun run predev
bunx convex dev --once
```

Copy the generated `CONVEX_URL` and `CONVEX_SITE_URL` from
`packages/backend/.env.local` into `apps/mobile/.env.local` as
`EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_CONVEX_SITE_URL`. Use the same pair in
`apps/web/.env.local` as `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL`.
These files are ignored by Git. Run `bun run dev` from the repository root to
start the backend, website, and Metro. Restart Metro after changing these URLs.
The cloud URL connects the mobile client; the site URL is available for HTTP
endpoints and is not needed for the native password flow.

Use a development build containing `expo-dev-client` and `expo-secure-store`.
Run `bun run android` or `bun run ios` once to install it, then use `bun run dev`.
Expo Go is not supported. No browser redirect or custom token exchange is needed
for username/password login. OAuth would require a separate browser flow.

Mobile uses the same [Convex Auth snapshot](../../vendor/README.md) as web and
the backend. Its React provider supports async SecureStore storage; native
password login needs no platform-specific Auth patch.

Mobile previews are release builds with embedded JavaScript, not development
clients. Android uses `assembleRelease`; iOS internal profiles explicitly disable
`developmentClient`. They run without Metro or Expo Go and use EAS Update for
compatible changes.

Select `android` in the root `disposabl.json`. When mobile or shared dependencies
change, CI computes the Expo fingerprint in the Web job after web/backend
deployment, reusing its runner and dependency install. The first run builds an
installable APK in a separate Android job on the selected Linux runner. Later
runs with the same fingerprint publish EAS Update from Web. Native jobs install
the workspace dependencies using the shared Bun cache; Android also restores
Gradle caches. Native jobs start after Web. Desktop builds run only on main.
Platform jobs have a 20-minute timeout; this is a limit, not a build-time guarantee.
Production iOS checks the latest finished EAS store build for the same app and
channel. If its fingerprint matches, CI publishes an iOS OTA update and skips
the native build. A missing or incompatible binary requires a new EAS build.
This check proves build compatibility, not App Store availability: distribute
the initial native build through TestFlight or the App Store. CI also checks
submissions for the matching build: missing or failed submissions retry the
existing binary once credentials are configured, while pending submissions
are not duplicated. Apple processing and store release remain separate.
With Expo connected,
PRs publish iOS OTA to their own channel and also produce a simulator archive.
Build jobs use standard GitHub-hosted runners and production iOS uses EAS Build. See the [app workflow](../../.github/workflows/pipeline.yml)
for the job order and cache behavior.

Each PR uses its own `pr-<number>` channel and Android application ID. Production
uses `production`. A new PR needs its own first APK even when another PR has the
same native dependencies. Install that APK once; compatible JavaScript and asset
updates download on launch and apply on the following cold launch. The shared
`UpdatePrompt` also checks when the app returns after at least five minutes
inactive. Brief interruptions and time spent using the app do not trigger checks.
The native `ON_LOAD` policy starts from the newest cached bundle immediately and
downloads compatible updates for the following cold launch. Once downloaded,
the banner offers **Update now** for a user-confirmed restart without interrupting work,
rechecks the server before applying an update, and respects rollback directives.
If Expo is still checking or downloading when a long inactive interval ends,
one foreground check waits until the app is active and Expo is idle. A generic
no-update response does not hide a bundle that Expo still reports as pending.
Offline checks leave the current app usable. Development builds skip this flow;
set `EXPO_PUBLIC_E2E=true` when building a release artifact for isolated tests.
This sets native `updates.enabled=false` as well as hiding the prompt, so tests
keep running the embedded bundle across cold launches. Normal builds retain
Expo's update and recovery settings. Removing an update on the server is not
a guarantee that cached bundles cannot launch; use Expo's rollback controls.
Verify real updates with a release APK or iOS simulator build, not a Metro client.

The last published APK is the baseline. Failed builds and partial uploads do
not advance it. A missing APK forces another build. Reverting a native change
also builds again, so users do not need to downgrade an older APK. An API or
authentication error fails CI rather than being interpreted as a missing build.

## Link an Expo project

Each generated app needs its own Expo project. From `apps/mobile`, run:

```sh
bunx eas-cli@27.2.0 init
bunx eas-cli@27.2.0 update:configure --platform all --environment preview
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
Turbo includes the web aliases in build cache keys. Every saved EAS backend URL,
including its VITE_ and EXPO_PUBLIC_ aliases, must match the deployed URLs;
conflicting values fail the build. Each PR uses its own deployed backend.
EAS variables with secret visibility are not available to this local build or
update flow; native secrets must be supplied through GitHub Actions.

## Build locally

Install Java 17 and the Android SDK, set `JAVA_HOME` and `ANDROID_HOME`, then:

```sh
DISPOSABL_MOBILE_CHANNEL=development bunx expo run:android --variant release
```

This is a release-mode build with its JavaScript bundled, so it runs without
Metro. Preview APKs use Expo's public debug signing key and a separate application
ID. The workflow configures dependency caches and invokes
[mobile.sh](../../.github/scripts/mobile.sh) for prebuild, Gradle compilation and
embedded fingerprint checks. [android-runner.sh](../../.github/scripts/android-runner.sh)
prepares disposable hosted-runner disk space and checks capacity before prebuild.

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

Web stages the Android APK after an OTA update; the Android job stages it after
a native build. Both upload intermediate `release-android` Actions artifacts.
The separate publisher waits for the selected build jobs, downloads verified
artifacts and publishes GitHub prereleases for previews or releases for production.
An exhausted Actions artifact quota can therefore block delivery after compilation.
Each PR reuses its Android release, normally `app-pr-N-android`, replacing the
APK/metadata and moving the tag to the tested commit. Only a published APK with
matching metadata and digest is reusable. The publisher executes scripts from
main with `contents: write`; fork PRs never deploy or publish. Android submission
to Google Play is not implemented. iOS production uses the separate EAS Build
and TestFlight flow described above; App Store release remains separate.

Backend URLs are available to mobile code through
`process.env.EXPO_PUBLIC_CONVEX_URL` and
`process.env.EXPO_PUBLIC_CONVEX_SITE_URL`. The distribution workflow supplies
them to the same native authentication flow used during development.

## Local Google Play bundle

The normal release workflow continues to produce installable APKs. For a Play
upload, first verify the existing listing package ID, highest uploaded version
code, and upload certificate SHA-256 in Play Console. For a new listing, use
its confirmed package ID and `0` as the previous version. Do not use a debug
key for a Play submission.

Use a dedicated local checkout configured for the confirmed package and version.
The script generates a fresh production Android project. Configure the intended
production backend URLs explicitly and set these environment variables:

- `PLAY_PACKAGE_ID`, `PLAY_PREVIOUS_VERSION_CODE`, `PLAY_UPLOAD_CERT_SHA256`
- `DISPOSABL_ANDROID_VERSION_CODE` (greater than the previous version)
- `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CONVEX_SITE_URL` (HTTPS)
- `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`
- `BUNDLETOOL_JAR`, the local path to the official standalone bundletool jar

Run `node apps/mobile/scripts/play-aab.mjs` from the repository root. It checks
the keystore certificate and Expo identity, then moves any existing `android`
directory to a printed temporary backup path and runs a fresh Expo prebuild.
Native customizations must be represented in Expo config/plugins; stale native
files are never reused. A failed prebuild restores the previous directory and
preserves partial output in the backup. Keep the upload keystore outside
`android`; relative input paths resolve from the command's working directory.
The build uses the configured Android architectures and verifies the AAB's manifest,
ABIs and upload signature. It prints the output path and SHA-256. It does not
upload or submit the bundle. Keep signing values out of shell history and logs.
A debug-signed or E2E bundle is not a Play release.

## iOS

When iOS is enabled and affected, the Web runner checks the latest
published iOS release for the same channel, project, bundle ID and runtime.
A matching IPA with a verified GitHub digest and unexpired provisioning profile
uses EAS Update. Otherwise a GitHub-hosted macOS runner performs an EAS local release
build using the remote signing credentials, then publishes its own iOS release.
That runner starts only when a new IPA is needed, after Web finishes, in parallel with any Android native build.

For an existing PR preview, platform selection compares against that platform's
last published source commit. Unchanged mobile code skips both native builds and
EAS Update. A successful iOS update advances the release's source commit and tag.

Each PR needs its own initial IPA because its channel is embedded in the app.
CI sets the EAS profile channel from the workflow's `CHANNEL`, verifies the IPA's
signature, bundle ID, embedded runtime and channel, and records its profile expiry.
Install the IPA on a registered iPhone; subsequent compatible changes use EAS
Update. Local builds are tracked by their GitHub release metadata, not EAS cloud
build history. Native builds take longer than the update-only path.

Internal distribution needs Apple signing credentials and registered devices.
CI uses the project's EAS ad hoc credentials automatically. Missing or invalid
credentials fail the iOS build instead of silently skipping it.
It does not require TestFlight or an App Store Connect app record. TestFlight is
a separate distribution option. The pipeline never submits to the App Store.

Android preview builds produce an installable APK. Production builds produce a signed installable APK. GitHub Actions builds and publishes these files; Expo hosts compatible EAS Updates.
