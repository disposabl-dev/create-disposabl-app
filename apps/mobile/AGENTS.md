This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use Bun from this workspace. Run Expo commands in `apps/mobile`; run the selected platform tests from the repository root.

```bash
bunx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
bunx expo start --dev-client # start the development-build server
bunx expo lint               # lint
bunx tsc --noEmit            # typecheck
bunx expo-doctor             # diagnose dependency and config issues
bunx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Local builds and testing

Prefer `bun run ios` or `bun run android` from `apps/mobile` when the local Xcode or Android toolchain is available. Build and install the development client, keep Metro running, then run `bun run test --target ios` or `bun run test --target android` from the repository root. Read `packages/tests/README.md` and use E2E for behavior checks. Do not push or start a cloud build just to verify a local change.

Use EAS or the release workflows for requested distribution when needed. A simulator build does not prove device signing or store readiness; do not submit to a store unless requested. Run EAS CLI as `bunx eas-cli <command>` in Bun projects.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Never use Expo Go. After adding a library with native code, rebuild the development client: `bunx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Agent skills and supported versions

Project skills live in `.agents/skills`, with Claude links in `.claude/skills` and source hashes in `skills-lock.json`. Read the relevant skill before using its workflow:

- `expo-upgrade` for package alignment and Expo Doctor.
- `expo-router`, `expo-ui`, and `expo-native-ui` for navigation and native presentation.
- `expo-dev-client` for development builds; `eas-update` for this app's OTA updates.
- `agent-device` and the platform simulator skill for visible runtime checks.

Refresh installed Expo skills with `bunx skills update --project --yes <skill-names>` from this directory. Keep upstream skills unmodified and put project-specific rules here. These rules override a skill's generic cloud build, deployment, or device examples. Do not launch cloud builds or submit to a store merely to test a local change.

Run `bunx expo install --check` and `bunx expo-doctor` after dependency changes. Use `bunx expo install <package>` and rebuild when native code changes. Match React across the mobile app and shared kit. The root `bunfig.toml` selects hoisted installs so Expo resolves one native module instance; retain that setting in generated apps. Do not hide duplicate native module warnings. A package's npm publication alone does not prove its CocoaPods and Maven dependencies are available. RevenueCat is pinned to the newest version whose native dependency graph has been verified locally; see `../../packages/disposabl-kit/PAYMENTS.md`.

## Device ownership and E2E

When T3 device tools are available, use `device_list` and `device_open`; launch and interact through the returned bound command. Use the device screenshot tool for visual evidence. Do not reuse another agent's device session. Follow a tool error's advice once, then report a persistent failure. Build, install, logs, Metro, and port forwards can use platform CLIs; UI actions use the bound device command.

Give each simulator/emulator and Metro port one owner. Derive the test app ID from the built artifact's Info.plist or Android manifest; never invent a placeholder. Start E2E only after the app is installed. Keep flows in `packages/tests` and read its README. Use the app's development or isolated backend; no production test accounts or copied credentials.

Build E2E binaries with `EXPO_PUBLIC_E2E=true`. This disables native OTA loading and sets Expo Dev Client defaults to hide its floating Tools button, skip onboarding, and keep the menu closed. Those overlays can intercept the account button. Existing development binaries can use Expo's documented launch URL flags `__expo_disable_fab=1`, `__expo_disable_onboarding=1`, and `__expo_disable_auto_launch=1` for that launch. Do not change app layout to work around a developer overlay.

Report compilation, installation, visible behavior, and provider transactions separately. A working debug build does not prove release OTA, store purchase synchronization, or store distribution. Analytics remains off in development and E2E.

## Product boundaries

In the Disposabl management app, do not add a shell, embedded generated-app preview, or runtime app switching. Generated apps implement their own product requirements. Expo Updates updates the installed app only. This is a new starter; do not add legacy account selectors, schema migration layers, or backward-compatibility branches unless the app's requirements explicitly call for them.
