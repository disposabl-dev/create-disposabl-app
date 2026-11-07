#!/usr/bin/env bash
set -euo pipefail
case "${1:?operation required}" in
  package-release)
[[ -f "packages/$PACKAGE/package.json" ]] || exit 0
platform=$PACKAGE
[[ "$PACKAGE" != sdk ]] || platform=typescript-sdk
bun run generate
bun run --cwd "packages/$PACKAGE" typecheck
name=$(node -p "require('./packages/$PACKAGE/package.json').name")
if ! previous=$(npm view "$name" version 2>/dev/null); then
  node .github/scripts/disposabl.mjs report "$platform" blocked 'Publish the package once and configure npm trusted publishing.'
  exit 0
fi
node .github/scripts/disposabl.mjs report "$platform" building
if GITHUB_TOKEN="$GH_TOKEN" npm_config_workspaces_update=false bun run --cwd "packages/$PACKAGE" release; then
  version=$(node -p "require('./packages/$PACKAGE/package.json').version")
  [[ "$version" != *development* ]] || version=$previous
  PUBLISHED_VERSION=$(npm view "$name@$version" version)
  export PUBLISHED_VERSION
  node .github/scripts/disposabl.mjs report "$platform" ready
else
  node .github/scripts/disposabl.mjs report "$platform" failed 'Package publication failed; check trusted publishing and the workflow log.'
  exit 1
fi
    ;;
  release-source)
if [[ "$GITHUB_EVENT_NAME" == push ]]; then
  echo 'current=true' >> "$GITHUB_OUTPUT"
  echo 'CHANNEL=production' >> "$GITHUB_ENV"
  echo 'PRERELEASE=false' >> "$GITHUB_ENV"
  exit
fi
echo 'PRERELEASE=true' >> "$GITHUB_ENV"
pr=$(gh api "repos/$GH_REPO/commits/$SOURCE/pulls" --jq ".[] | select(.state == \"open\" and .head.sha == \"$SOURCE\" and .head.repo.full_name == \"$GH_REPO\") | .number" | head -1)
if [[ -z "$pr" ]]; then echo 'current=false' >> "$GITHUB_OUTPUT"; exit; fi
echo 'current=true' >> "$GITHUB_OUTPUT"
echo "CHANNEL=pr-$pr" >> "$GITHUB_ENV"
echo "PR=$pr" >> "$GITHUB_ENV"
    ;;
  release-publish)
check_source() {
  if [[ "$CHANNEL" == production ]]; then test "$(gh api "repos/$GH_REPO/git/ref/heads/main" --jq .object.sha)" = "$SOURCE"
  else test "$(gh api "repos/$GH_REPO/pulls/$PR" --jq 'if .state == "open" then .head.sha else "closed" end')" = "$SOURCE"; fi
}
# Desktop installers publish only from main. Android retains PR previews.
for platform in android linux windows; do
  [[ "$platform" == android || "$CHANNEL" == production ]] || continue
  directory="artifacts/release-$platform"
  test -d "$directory" || continue
  check_source
  tag="app-$CHANNEL-$platform"
  if [[ "$CHANNEL" == production ]]; then tag+="-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"; fi
  preserve_apk=false
  if [[ "$platform" == android && ! -f "$directory/android.apk" ]]; then
    source_tag=$(jq -er 'select(.action == "update") | .sourceTag | strings | select(length > 0)' "$directory/android.json")
    base="app-$CHANNEL-android"
    if [[ "$source_tag" != "$base" ]]; then
      [[ "$CHANNEL" == production && "$source_tag" == "$base-"* && "${source_tag#"$base-"}" =~ ^[0-9]+-[0-9]+$ ]] || { echo 'Invalid Android source release'; exit 1; }
    fi
    gh api "repos/$GH_REPO/releases/tags/$source_tag" > "$RUNNER_TEMP/android-source.json"
    ANDROID_MANIFEST="$directory/android.json" node --input-type=module -e '
      import {readFileSync} from "node:fs";
      const wanted = JSON.parse(readFileSync(process.env.ANDROID_MANIFEST, "utf8"));
      const release = JSON.parse(readFileSync(`${process.env.RUNNER_TEMP}/android-source.json`, "utf8"));
      const prior = JSON.parse(/<!-- android (\{[^\n]+\}) -->/.exec(release.body || "")?.[1] || "null");
      const fields = ["channel", "projectId", "applicationId", "runtimeVersion", "sha256"];
      if (release.draft !== false || !prior || wanted.channel !== process.env.CHANNEL
        || !/^[a-f0-9]{40,64}$/.test(wanted.runtimeVersion || "") || !/^[a-f0-9]{64}$/.test(wanted.sha256 || "")
        || !fields.every(k => typeof wanted[k] === "string" && wanted[k].trim() && prior[k] === wanted[k])
        || !release.assets?.some(a => a.name === "android.apk" && a.state === "uploaded" && a.size > 0 && a.digest === `sha256:${wanted.sha256}`)) {
        throw new Error("Android source release does not match the OTA manifest.");
      }
    '
    gh release download "$source_tag" --pattern android.apk --dir "$directory"
    printf '%s  %s\n' "$(jq -er .sha256 "$directory/android.json")" "$directory/android.apk" | sha256sum -c -
    check_source
    if [[ "$source_tag" == "$tag" ]]; then preserve_apk=true; fi
  fi
  printf 'Platform: %s\nSource: %s\n' "$platform" "$SOURCE" > "$RUNNER_TEMP/release-notes.md"
  if [[ -f "$directory/android.json" ]]; then printf '<!-- android %s -->\n' "$(jq -c . "$directory/android.json")" >> "$RUNNER_TEMP/release-notes.md"; fi
  if gh release view "$tag" --json assets,isDraft > "$RUNNER_TEMP/previous-release.json"; then
    # --clobber deletes before uploading. Keep the verified source APK intact so
    # a failed metadata upload can retry without losing its only stored binary.
    assets=("$directory/"*)
    if [[ "$preserve_apk" == true ]]; then assets=("$directory/android.json"); fi
    gh release upload "$tag" "${assets[@]}" --clobber
    while IFS= read -r asset; do
      if [[ ! -f "$directory/$asset" ]]; then check_source; gh release delete-asset "$tag" "$asset" --yes; fi
    done < <(jq -r '.assets[].name' "$RUNNER_TEMP/previous-release.json")
    check_source
    if [[ "$(jq -r .isDraft "$RUNNER_TEMP/previous-release.json")" == true ]]; then
      # Drafts may not have a tag yet after a partially failed publish.
      gh release edit "$tag" --target "$SOURCE"
    else
      gh api --method PATCH "repos/$GH_REPO/git/refs/tags/$tag" -f sha="$SOURCE" -F force=true > /dev/null
    fi
  else
    gh release create "$tag" "$directory/"* --draft --target "$SOURCE" --title "$CHANNEL / $platform" --notes-file "$RUNNER_TEMP/release-notes.md" --prerelease="$PRERELEASE"
  fi
  check_source
  gh release edit "$tag" --notes-file "$RUNNER_TEMP/release-notes.md" --draft=false --prerelease="$PRERELEASE" --latest=false
  node .github/scripts/disposabl.mjs release "$platform" "$tag"
done
    ;;
  verify-artifacts)
check_source() { test "$(gh api "repos/$GH_REPO/$SOURCE_PATH" --jq 'if has("head") then (if .state == "open" then .head.sha else "closed" end) else .object.sha end')" = "$SOURCE"; }
check_source
for file in dist/release/*; do test -f "$file"; test -s "$file"; done
case "$PLATFORM" in
  android)
    test -s dist/release/android.json
    if [[ ! -s dist/release/android.apk ]]; then
      jq -e '(.action == "update") and (.sourceTag | type == "string" and length > 0)' dist/release/android.json > /dev/null
    fi
    ;;
  ios) test -s dist/release/ios.ipa; test -s dist/release/ios.json ;;
  linux) compgen -G 'dist/release/*.deb' > /dev/null; compgen -G 'dist/release/*.rpm' > /dev/null ;;
  windows) compgen -G 'dist/release/*.exe' > /dev/null; compgen -G 'dist/release/*.nupkg' > /dev/null; test -s dist/release/RELEASES ;;
  macos) compgen -G 'dist/release/*.dmg' > /dev/null; compgen -G 'dist/release/*.zip' > /dev/null ;;
  *) exit 1 ;;
esac
    ;;
  *) echo "Unknown operation: $1" >&2; exit 1 ;;
esac
