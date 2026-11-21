#!/usr/bin/env bash
set -euo pipefail
# Exercise the real publisher with provider commands replaced by local recorders.
fixture_root=$PWD
mkdir -p "$RUNNER_TEMP/layout-bin"
cat > "$RUNNER_TEMP/layout-bin/gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1 $2" == 'api repos/fixture/repo/git/ref/heads/main' ]]; then
  printf '%s\n' "$SOURCE"
elif [[ "$1 $2" == 'release view' ]]; then
  exit 1
else
  printf '%s\n' "$*" >> "$RUNNER_TEMP/publisher-calls"
fi
SH
cat > "$RUNNER_TEMP/layout-bin/node" <<'SH'
#!/usr/bin/env bash
printf 'node %s\n' "$*" >> "$RUNNER_TEMP/publisher-calls"
SH
chmod +x "$RUNNER_TEMP/layout-bin/gh" "$RUNNER_TEMP/layout-bin/node"
export PATH="$RUNNER_TEMP/layout-bin:$PATH" CHANNEL=production GH_REPO=fixture/repo SOURCE=fixture-source PRERELEASE=false
export GITHUB_RUN_ID=1 GITHUB_RUN_ATTEMPT=1 GITHUB_EVENT_NAME=workflow_dispatch
: > "$RUNNER_TEMP/publisher-calls"
bash .github/scripts/release.sh release-publish
count=$(grep -c '^release create ' "$RUNNER_TEMP/publisher-calls" || true)
test "$count" = "$EXPECTED_PUBLISHED" || { echo "Expected $EXPECTED_PUBLISHED publisher inputs, got $count"; cat "$RUNNER_TEMP/publisher-calls"; exit 1; }
if [[ "$EXPECTED_PUBLISHED" != 0 ]]; then
  grep -F 'artifacts/release-android/android.apk' "$RUNNER_TEMP/publisher-calls"
  if [[ "$EXPECTED_PUBLISHED" == 2 ]]; then grep -F 'artifacts/release-linux/linux.deb' "$RUNNER_TEMP/publisher-calls"; fi
fi
printf 'Publisher consumed %s expected directories in %s\n' "$count" "$fixture_root/artifacts"
