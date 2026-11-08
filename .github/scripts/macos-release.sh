#!/usr/bin/env bash
set -euo pipefail
set +x

clean_directory() {
  local directory=$1
  [[ "${directory%/*}" == "${RUNNER_TEMP:?}" && "${directory##*/}" == macos-signing.???????? && ! -L "$directory" ]] || return 1
  security delete-keychain "$directory/signing.keychain-db" >/dev/null 2>&1 || true
  rm -f -- "$directory/certificate.p12" "$directory/AuthKey.p8"
  if [[ -d "$directory/mount" ]]; then
    # Never recursively remove a volume that could not be detached.
    hdiutil detach "$directory/mount" >/dev/null 2>&1 || rmdir "$directory/mount" || return 1
  fi
  rm -rf -- "$directory"
}

if [[ "${1:-}" == cleanup ]]; then
  [[ -z "${MACOS_SIGNING_DIRECTORY:-}" ]] || clean_directory "$MACOS_SIGNING_DIRECTORY"
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
cleanup() { local status=$?; clean_directory "$temp" || status=1; exit "$status"; }
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
printf 'MACOS_SIGNING_DIRECTORY=%s\n' "$temp" >> "${GITHUB_ENV:?}"
umask 077
jq -r .certificateBase64 <<< "$MACOS_SIGNING_CONFIG" | base64 -D > "$temp/certificate.p12"
jq -r .apiKeyBase64 <<< "$MACOS_SIGNING_CONFIG" | base64 -D > "$temp/AuthKey.p8"
password=$(openssl rand -hex 32)
security create-keychain -p "$password" "$keychain"
security set-keychain-settings -lut 1800 "$keychain"
security unlock-keychain -p "$password" "$keychain"
security import "$temp/certificate.p12" -k "$keychain" -P "$(jq -r .certificatePassword <<< "$MACOS_SIGNING_CONFIG")" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$password" "$keychain" >/dev/null
export MACOS_NOTARIZE=true MACOS_KEYCHAIN="$keychain" MACOS_SIGNING_IDENTITY="$identity"
export APPLE_API_KEY="$temp/AuthKey.p8" APPLE_API_KEY_ID="$(jq -r .apiKeyId <<< "$MACOS_SIGNING_CONFIG")" APPLE_API_ISSUER="$(jq -r .apiIssuer <<< "$MACOS_SIGNING_CONFIG")"
unset MACOS_SIGNING_CONFIG password
bun run --cwd apps/desktop preview
shopt -s nullglob
zips=(dist/release/*.zip)
dmgs=(dist/release/*.dmg)
[[ ${#zips[@]} == 1 && ${#dmgs[@]} == 1 ]] || { echo 'Expected one macOS update ZIP and DMG' >&2; exit 1; }
mkdir "$temp/verify"
ditto -x -k "${zips[0]}" "$temp/verify"
apps=("$temp"/verify/*.app)
[[ ${#apps[@]} == 1 ]] || { echo 'Expected one app in the update ZIP' >&2; exit 1; }
verify_app() {
  local details
  codesign --verify --deep --strict --verbose=2 "$1" >&2 || return 1
  details=$(codesign -dv --verbose=4 "$1" 2>&1) || return 1
  grep -Fx "Authority=$identity" <<< "$details" >/dev/null || return 1
  grep -Fx "TeamIdentifier=$team" <<< "$details" >/dev/null || return 1
  xcrun stapler validate "$1" >&2 || return 1
  spctl --assess --type execute --verbose=2 "$1" >&2 || return 1
  grep -E '^CDHash=[a-f0-9]+$' <<< "$details"
}
zip_hash=$(verify_app "${apps[0]}")
mkdir "$temp/mount"
hdiutil attach -readonly -nobrowse -mountpoint "$temp/mount" "${dmgs[0]}" >/dev/null
apps=("$temp"/mount/*.app)
[[ ${#apps[@]} == 1 ]] || { echo 'Expected one app in the DMG' >&2; exit 1; }
dmg_hash=$(verify_app "${apps[0]}")
[[ "$dmg_hash" == "$zip_hash" ]] || { echo 'DMG and update ZIP contain different apps' >&2; exit 1; }
hdiutil detach "$temp/mount" >/dev/null
[[ ! -d "$temp/mount" ]] || rmdir "$temp/mount"
echo 'MACOS_NOTARIZE=true' >> "${GITHUB_ENV:?}"
