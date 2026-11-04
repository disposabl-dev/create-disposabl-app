#!/usr/bin/env python3
"""Sign a GitHub-built iPhone preview locally using an existing Xcode profile."""
import argparse
import datetime
import fnmatch
import hashlib
import os
import pathlib
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile


def run(*args):
    return subprocess.check_output(args, stderr=subprocess.PIPE)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def allowed(value, grant):
    if isinstance(value, str) and isinstance(grant, str):
        return fnmatch.fnmatchcase(value, grant)
    if isinstance(value, list) and isinstance(grant, list):
        return all(any(allowed(item, other) for other in grant) for item in value)
    return type(value) is type(grant) and value == grant


def sign(args):
    require(sys.platform == "darwin", "Run this helper on the Mac with Xcode and its signing identity.")
    profile_path = pathlib.Path(args.profile).resolve(strict=True)
    profile = plistlib.loads(run("security", "cms", "-D", "-i", str(profile_path)))
    expires = profile["ExpirationDate"].replace(tzinfo=datetime.timezone.utc)
    require(expires > datetime.datetime.now(datetime.timezone.utc), "Profile expired. Renew it with Xcode Personal Team signing.")
    require(args.device in profile.get("ProvisionedDevices", []), "This iPhone is not registered in the supplied profile. Connect it to Xcode and renew the profile.")
    identity = args.identity.upper()
    require(re.fullmatch(r"[A-F0-9]{40}", identity), "Use a certificate SHA-1 from security find-identity -v -p codesigning.")
    certificates = {hashlib.sha1(cert).hexdigest().upper() for cert in profile.get("DeveloperCertificates", [])}
    require(identity in certificates, "Signing identity is not authorized by this profile.")
    require(identity in run("security", "find-identity", "-v", "-p", "codesigning").decode(), "The certificate and private key must be available in this Mac's Keychain.")
    output = pathlib.Path(args.output).resolve()
    require(not output.exists(), "Output directory exists; choose a new path to preserve the prior build.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="disposabl-sign-", dir=output.parent) as temp:
        staging = pathlib.Path(temp)
        with zipfile.ZipFile(args.ipa) as archive:
            names = archive.namelist()
            for name in names:
                path = pathlib.PurePosixPath(name)
                require(not path.is_absolute() and ".." not in path.parts, "Unsafe path in IPA.")
                mode = archive.getinfo(name).external_attr >> 16
                require(mode & 0o170000 != 0o120000, "IPA contains a symbolic link; inspect it before signing.")
            require("Disposabl.entitlements.plist" in names, "Missing CI entitlement manifest. Download a complete Disposabl unsigned IPA.")
            required = plistlib.loads(archive.read("Disposabl.entitlements.plist"))
        run("ditto", "-x", "-k", str(pathlib.Path(args.ipa).resolve()), str(staging))
        apps = list((staging / "Payload").glob("*.app"))
        require(len(apps) == 1, "Expected one iPhone app in Payload.")
        app = apps[0]
        require(not list(app.rglob("*.appex")) and not list(app.rglob("*.app")), "Extensions/watch apps need their own matching profiles; this helper supports one app only.")
        info = plistlib.loads((app / "Info.plist").read_bytes())
        require("iPhoneOS" in info.get("CFBundleSupportedPlatforms", []), "Simulator builds cannot run on an iPhone.")
        bundle = info["CFBundleIdentifier"]
        grants = profile["Entitlements"]
        prefix = profile["ApplicationIdentifierPrefix"][0]
        application_id = prefix + "." + bundle
        require(allowed(application_id, grants.get("application-identifier")), "Profile bundle ID does not match this preview. Select the exact preview bundle ID in Xcode.")
        require(grants.get("get-task-allow") is True, "Use an Xcode development/Personal Team profile for this preview.")

        def expand(value):
            if isinstance(value, str):
                return value.replace("$(AppIdentifierPrefix)", prefix + ".").replace("$(TeamIdentifierPrefix)", profile["TeamIdentifier"][0] + ".").replace("$(PRODUCT_BUNDLE_IDENTIFIER)", bundle)
            if isinstance(value, list):
                return [expand(item) for item in value]
            return value

        entitlements = {key: expand(value) for key, value in required.items()}
        entitlements.update({"application-identifier": application_id,
                             "com.apple.developer.team-identifier": profile["TeamIdentifier"][0],
                             "get-task-allow": True})
        entitlements.setdefault("keychain-access-groups", [application_id])
        for key, value in entitlements.items():
            require(key in grants and allowed(value, grants[key]), f"Profile does not allow capability {key}. Resolve it in Xcode; the helper will not remove capabilities.")
        executable = app / info["CFBundleExecutable"]
        require(executable.is_file() and executable.parent == app, "Invalid app executable.")
        require("arm64" in run("xcrun", "lipo", "-archs", str(executable)).decode(), "Expected an arm64 iPhone binary.")
        executable.chmod(executable.stat().st_mode | 0o111)
        shutil.copy2(profile_path, app / "embedded.mobileprovision")
        entitlement_file = staging / "signing-entitlements.plist"
        entitlement_file.write_bytes(plistlib.dumps(entitlements))
        nested = list(app.rglob("*.framework")) + list(app.rglob("*.dylib"))
        for binary in sorted(nested, key=lambda path: len(path.parts), reverse=True):
            run("codesign", "--force", "--sign", identity, str(binary))
        run("codesign", "--force", "--sign", identity, "--generate-entitlement-der", "--entitlements", str(entitlement_file), str(app))
        run("codesign", "--verify", "--deep", "--strict", str(app))
        run("ditto", "-c", "-k", "--keepParent", str(staging / "Payload"), str(staging / "ios-signed.ipa"))
        entitlement_file.unlink()
        shutil.move(str(staging), str(output))
    signed_app = output / "Payload" / app.name
    print(f"Signed preview: {signed_app}\nSigned IPA: {output / 'ios-signed.ipa'}\nProfile expires: {expires.isoformat()}")
    print("Signing is complete; installation and launch still need verification on the iPhone.")
    if args.install:
        subprocess.run(["xcrun", "devicectl", "device", "install", "app", "--device", args.device, str(signed_app)], check=True)
        print("Installed. Launch the app on the iPhone and verify its behavior.")


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--ipa", required=True, help="Downloaded ios-unsigned.ipa")
parser.add_argument("--profile", required=True, help="Matching Xcode-managed .mobileprovision")
parser.add_argument("--identity", required=True, help="Local development signing certificate SHA-1")
parser.add_argument("--device", required=True, help="iPhone provisioning UDID")
parser.add_argument("--output", required=True, help="New directory for the signed app and IPA")
parser.add_argument("--install", action="store_true", help="Install using Xcode devicectl after signing")
if __name__ == "__main__":
    try:
        sign(parser.parse_args())
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        print(f"Could not sign/install preview: {error}", file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError) and error.stderr:
            print(error.stderr.decode(errors="replace"), file=sys.stderr)
        sys.exit(1)
