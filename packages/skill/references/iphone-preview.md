# Test on a physical iPhone

Use this guide when the user requests a physical iPhone build. Check the current
workflow before promising an artifact: the starter's iOS preview job produces
`ios-simulator.zip`, containing a simulator `.app`. It cannot run on an iPhone
and cannot be converted into a device build by signing it. Production uses EAS
Build and TestFlight when configured. The starter does not produce unsigned
physical-device IPAs. If iOS builds are disabled, neither CI path runs.

## Build and provision with Xcode

Prefer the app's native Xcode project for local device testing. Check for full
Xcode with `xcodebuild -version`, install the app's dependencies, and generate its
native project with Expo prebuild if needed. Prebuild generates files; it does
not compile or install the app. Use the project's configured backend and channel.

Open the generated workspace on the owner's Mac. In Xcode, select the connected
iPhone and the correct Apple team, enable automatic signing, and resolve the
capability or provisioning issues Xcode reports. Let the user complete Apple
Account, Trust and Developer Mode prompts when required. A simulator identifier
is not a physical phone's provisioning UDID.

A free Personal Team uses Xcode's connected-device provisioning. Expo device
registration and ad hoc distribution require a paid Apple Developer membership.
For an explicitly requested Expo ad hoc build, use the URL returned by
`bunx eas-cli@27.2.0 device:create`, then obtain a matching profile and build.
Registration alone does not make an app installable. Surface unsupported
capabilities rather than silently removing them.

## When an unsigned device IPA is already available

Use the signing helper only with an actual iPhone IPA from a verified source
revision. Do not invent a workflow artifact name or substitute a simulator build.
Inspect `Payload/<app>.app/Info.plist` for the exact bundle ID and confirm the
local development profile matches that ID, phone, signing identity, capabilities
and expiry. Xcode must provision the profile first; the helper does not create it.

```sh
python3 packages/skill/scripts/sign-iphone.py \
  --ipa /absolute/path/to/device.ipa \
  --profile /absolute/path/to/profile.mobileprovision \
  --identity CERTIFICATE_SHA1 \
  --device IPHONE_PROVISIONING_UDID \
  --output ./signed-preview \
  --install
```

The helper signs frameworks and the app, verifies the signature, and can install
with Xcode's `devicectl`. It preserves existing output directories, so choose a
new output path. Extensions and Watch apps require separate profiles and are
outside this helper's scope. Keep Apple passwords, private keys and personal
profiles off GitHub and out of logs.

## Verify the installed app

Use the session's supported device tools and keep the phone under one owner.
Launch the app, exercise the requested feature, verify its backend and login,
then relaunch and check saved state. Installation alone is not delivery. If the
phone cannot be automated, ask the user to verify it and distinguish that evidence
from automated checks. Follow tool retry limits instead of switching to an
unsupported control path. Renew expired profiles through Xcode when necessary.

References: [Apple account capabilities and limits](https://developer.apple.com/help/account/basics/about-your-developer-account/),
[run on a device](https://help.apple.com/xcode/mac/current/en.lproj/dev5a825a1ca.html),
[Expo internal distribution](https://docs.expo.dev/build/internal-distribution/).
