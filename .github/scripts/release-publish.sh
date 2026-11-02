#!/usr/bin/env bash
set -euo pipefail
check_source() {
  if [[ "$CHANNEL" == production ]]; then test "$(gh api "repos/$GH_REPO/git/ref/heads/main" --jq .object.sha)" = "$SOURCE"
  else test "$(gh api "repos/$GH_REPO/pulls/$PR" --jq 'if .state == "open" then .head.sha else "closed" end')" = "$SOURCE"; fi
}
# Apple publication remains disabled along with the build jobs.
for platform in android linux windows; do
  directory="artifacts/release-$platform"
  test -d "$directory" || continue
  check_source
  tag="app-$CHANNEL-$platform"
  if [[ "$CHANNEL" == production ]]; then tag+="-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"; fi
  printf 'Platform: %s\nSource: %s\n' "$platform" "$SOURCE" > "$RUNNER_TEMP/release-notes.md"
  if [[ -f "$directory/android.json" ]]; then printf '<!-- android %s -->\n' "$(jq -c . "$directory/android.json")" >> "$RUNNER_TEMP/release-notes.md"; fi
  if gh release view "$tag" --json assets > "$RUNNER_TEMP/previous-release.json"; then
    gh release upload "$tag" "$directory/"* --clobber
    while IFS= read -r asset; do
      if [[ ! -f "$directory/$asset" ]]; then check_source; gh release delete-asset "$tag" "$asset" --yes; fi
    done < <(jq -r '.assets[].name' "$RUNNER_TEMP/previous-release.json")
    gh api --method PATCH "repos/$GH_REPO/git/refs/tags/$tag" -f sha="$SOURCE" -F force=true > /dev/null
  else
    gh release create "$tag" "$directory/"* --draft --target "$SOURCE" --title "$CHANNEL / $platform" --notes-file "$RUNNER_TEMP/release-notes.md" --prerelease="$PRERELEASE"
  fi
  check_source
  gh release edit "$tag" --notes-file "$RUNNER_TEMP/release-notes.md" --draft=false --prerelease="$PRERELEASE" --latest=false
  node .github/scripts/disposabl.mjs release "$platform" "$tag"
done
