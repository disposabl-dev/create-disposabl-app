# Test an iPhone preview with Xcode

Use this procedure for a physical iPhone preview built on GitHub. It does not
publish to the App Store or TestFlight, and does not require AltStore or another
installer. Compilation happens on GitHub-hosted macOS runners. Signing happens on the
owner's Mac with Xcode and their Apple Account.

## Choose the correct account flow

Ask only if the account type is unknown. A free Personal Team uses Xcode's
connected-device provisioning; Expo's browser-based device registration and ad
hoc distribution require a paid Apple Developer Program membership. Do not open
an Expo registration page and imply that it enables free provisioning.

For a paid developer account requesting Expo ad hoc distribution, use
`bunx eas-cli@27.2.0 device:create` and open the URL returned by that command on
the intended iPhone. Do not invent an enrollment URL. After registration, refresh
the matching ad hoc profile before building/signing. Device registration alone
is not a profile or an installable build. The default unsigned-preview pipeline
does not configure ad hoc distribution automatically.

## Free Personal Team setup on the owner's Mac

1. Check for full Xcode with `xcodebuild -version`. Command Line Tools alone are
   insufficient. Use the connected target Mac, not an unrelated developer's Mac.
2. Open Xcode and its Apple Account settings when setup is needed. Let the user
   sign in directly. Connect the iPhone by USB, accept Trust on the phone, and
   enable Developer Mode when required. Use Xcode's Devices and Simulators to
   pair it and obtain its provisioning UDID. A simulator ID is not that UDID.
3. Inspect the downloaded preview's `Payload/<app>.app/Info.plist` for the exact
   bundle ID; preview IDs can differ from the production ID. Configure automatic
   signing for that ID and the required capabilities in Xcode, select the user's
   Personal Team and connected iPhone, and resolve the signing issues Xcode shows.
   Open the generated native project if available. Creating native project files
   with Expo prebuild is not native compilation.
4. Obtain the matching Xcode-managed development profile and the certificate
   identity from this Mac. Xcode manages these under its signing settings; recent
   versions store profiles under `~/Library/Developer/Xcode/UserData/Provisioning Profiles`,
   older versions under `~/Library/MobileDevice/Provisioning Profiles`.
   Inspect metadata with `security cms -D -i <profile>` without dumping it into
   chat. Confirm the exact bundle ID, phone UDID, allowed capabilities and expiry.
   List available identity fingerprints with `security find-identity -v -p codesigning`.

If there is no matching profile, explain that Xcode can provision it using a tiny
local iOS project. Create that project outside the generated app, with the exact
preview bundle ID, required capabilities, automatic signing, and the user's
Personal Team. Build only that project for the connected phone:

```sh
xcodebuild -project Provisioning.xcodeproj -scheme Provisioning \
  -configuration Debug -destination 'id=IPHONE_UDID' \
  -derivedDataPath ./provisioning-build \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
```

This compiles the tiny provisioning project, not the React Native app. Do not
install the placeholder. Inspect the generated profile for the exact app ID,
phone, certificate, capabilities and expiry before signing the downloaded IPA.
This route was verified with Xcode 27.2 and a free Personal Team; account prompts
and unsupported capabilities can still require user action. The signing helper
does not create this project or renew profiles automatically.

Do not upload Apple passwords, private keys, signing certificates or personal
profiles to GitHub. The unsigned build does not need them. Some capabilities are
unavailable to free teams; surface that limitation rather than silently removing
features. Extensions and Watch apps need separate profiles and are not supported
by this single-app signing helper.

## Download, sign and install

The workflow builds unsigned iPhone IPAs for PR previews and main.
Download the `ios-native-<channel>` artifact from the exact successful GitHub run.
It contains `ios-unsigned.ipa`, this guide, the signing helper, and verified build
metadata. Check the SHA/run and artifact digest before executing downloaded code.
The IPA is not directly installable until it has been signed.

Run the included helper on the owner's Mac, substituting inspected values:

```sh
python3 sign-iphone.py \
  --ipa ios-unsigned.ipa \
  --profile /absolute/path/to/profile.mobileprovision \
  --identity CERTIFICATE_SHA1 \
  --device IPHONE_PROVISIONING_UDID \
  --output ./signed-preview \
  --install
```

In a generated app, the helper also lives at
`packages/skill/scripts/sign-iphone.py`. The helper validates the local identity,
profile, expiry, device, app ID and capabilities; signs embedded frameworks and
the app; verifies the signature; and optionally installs with Xcode's
`devicectl`. It does not create or renew profiles and does not compile the app.
An existing output directory is preserved; use a new path on each run.

Free profiles expire after seven days. Renew through Xcode, then re-sign and
reinstall the same compatible downloaded binary; changing a native dependency
requires a new GitHub build. Apple limits free accounts to three installed apps
per device and limits App IDs/devices as documented below.

Use the session's supported device tools for discovery, opening, launch and
visible verification. Keep the phone under one owner. Installation success is
not completion: launch the app, exercise the requested feature, check the
preview backend and authentication, relaunch, and verify saved state. If the
phone or matching profile is unavailable, report exactly that; do not call the
preview installed or verified. A device panel may list simulators only even when
Xcode sees the physical phone. Respect the host's control restrictions; after a
permitted installation, ask the user to open and test the app if physical-device
UI automation is unavailable. Report that as user verification, not automation.

References: [Apple Personal Team limits](https://developer.apple.com/help/account/basics/about-your-developer-account/),
[run on a device](https://help.apple.com/xcode/mac/current/en.lproj/dev5a825a1ca.html),
[Apple signing workflow](https://help.apple.com/xcode/mac/current/en.lproj/dev60b6fbbc7.html),
[Expo device registration](https://docs.expo.dev/build/internal-distribution/).
