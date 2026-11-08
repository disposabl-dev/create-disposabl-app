#!/usr/bin/env bash
set -euo pipefail
set +x

if [[ "${1:-}" == cleanup ]]; then
  shopt -s nullglob
  for directory in "${RUNNER_TEMP:?}"/macos-signing.????????; do
    [[ -d "$directory" && ! -L "$directory" ]] || continue
    security delete-keychain "$directory/signing.keychain-db" >/dev/null 2>&1 || true
    rm -rf -- "$directory"
  done
  exit
fi

# This wrapper owns the credentials for the build and removes them on every exit.
if [[ -z "${MACOS_SIGNING_CONFIG:-}" ]]; then
  export MACOS_NOTARIZE=false
  bun run --cwd apps/desktop preview
  exit
fi

for field in certificateBase64 certificatePassword identity teamId apiKeyBase64 apiKeyId apiIssuer; do
  jq -e --arg field "$field" '.[$field] | type == "string" and length > 0 and (contains("\n") | not) and (contains("\r") | not)' <<< "$MACOS_SIGNING_CONFIG" >/dev/null || { echo "Invalid macOS signing configuration: $field" >&2; exit 1; }
done
identity=$(jq -r .identity <<< "$MACOS_SIGNING_CONFIG")
team=$(jq -r .teamId <<< "$MACOS_SIGNING_CONFIG")
[[ "$team" =~ ^[A-Z0-9]{10}$ && "$identity" == "Developer ID Application: "*" ($team)" ]] || { echo 'Expected a Developer ID Application identity and team ID' >&2; exit 1; }
temp=$(mktemp -d "${RUNNER_TEMP:?}/macos-signing.XXXXXXXX")
keychain="$temp/signing.keychain-db"
cleanup() { security delete-keychain "$keychain" >/dev/null 2>&1 || true; rm -rf -- "$temp"; }
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
umask 077
jq -r .certificateBase64 <<< "$MACOS_SIGNING_CONFIG" | base64 -D > "$temp/certificate.p12"
jq -r .apiKeyBase64 <<< "$MACOS_SIGNING_CONFIG" | base64 -D > "$temp/AuthKey.p8"
password=$(openssl rand -hex 32)
security create-keychain -p "$password" "$keychain"
security unlock-keychain -p "$password" "$keychain"
security import "$temp/certificate.p12" -k "$keychain" -P "$(jq -r .certificatePassword <<< "$MACOS_SIGNING_CONFIG")" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$password" "$keychain" >/dev/null
export MACOS_NOTARIZE=true MACOS_KEYCHAIN="$keychain" MACOS_SIGNING_IDENTITY="$identity"
export APPLE_API_KEY="$temp/AuthKey.p8" APPLE_API_KEY_ID="$(jq -r .apiKeyId <<< "$MACOS_SIGNING_CONFIG")" APPLE_API_ISSUER="$(jq -r .apiIssuer <<< "$MACOS_SIGNING_CONFIG")"
unset MACOS_SIGNING_CONFIG password
bun run --cwd apps/desktop preview
shopt -s nullglob
zips=(dist/release/*.zip)
[[ ${#zips[@]} == 1 ]] || { echo 'Expected one macOS update ZIP' >&2; exit 1; }
mkdir "$temp/verify"
ditto -x -k "${zips[0]}" "$temp/verify"
apps=("$temp"/verify/*.app)
[[ ${#apps[@]} == 1 ]] || { echo 'Expected one app in the update ZIP' >&2; exit 1; }
codesign --verify --deep --strict --verbose=2 "${apps[0]}"
details=$(codesign -dv --verbose=4 "${apps[0]}" 2>&1)
grep -Fx "Authority=$identity" <<< "$details" >/dev/null
grep -Fx "TeamIdentifier=$team" <<< "$details" >/dev/null
xcrun stapler validate "${apps[0]}"
spctl --assess --type execute --verbose=2 "${apps[0]}"
echo 'MACOS_NOTARIZE=true' >> "${GITHUB_ENV:?}"
