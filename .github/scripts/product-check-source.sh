#!/usr/bin/env bash
set -euo pipefail
[[ "$EXPECTED_SOURCE" =~ ^[0-9a-f]{40}$ && "$(git rev-parse HEAD)" == "$EXPECTED_SOURCE" ]] || { echo "Invalid checked-out source." >&2; exit 1; }
[[ -z "$CLI_RECOVERY" || -z "$GENERATOR_RECOVERY" ]] || { echo "Select only one recovery." >&2; exit 1; }
sha=$EXPECTED_SOURCE
if [[ "$GITHUB_WORKFLOW_REF" == "$GITHUB_REPOSITORY/.github/workflows/publish.yml@"* ]]; then
  [[ "$GITHUB_WORKFLOW_REF" == "$GITHUB_REPOSITORY/.github/workflows/publish.yml@refs/heads/main" && "$GITHUB_REF" == refs/heads/main && "$EVENT_SHA" == "$EXPECTED_SOURCE" ]] || { echo "Invalid event source." >&2; exit 1; }
  version=${CLI_RECOVERY:-$GENERATOR_RECOVERY}
  if [[ -n "$version" ]]; then
    [[ "$GITHUB_EVENT_NAME" == workflow_dispatch ]] || { echo "Recovery requires manual dispatch." >&2; exit 1; }
    [[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo "Invalid recovery version." >&2; exit 1; }
    if [[ -n "$CLI_RECOVERY" ]]; then
      tag="@disposabl/cli@${version}"
      highest=$(git tag --merged "$EVENT_SHA" --list '@disposabl/cli@*' --sort=-version:refname | grep -E '^@disposabl/cli@(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' | head -1)
      [[ "$tag" == "$highest" ]] || { echo "Recovery must use the highest reachable CLI release tag." >&2; exit 1; }
    else
      tag="v${version}"
    fi
    sha=$(git rev-parse --verify "refs/tags/${tag}^{commit}")
    git merge-base --is-ancestor "$sha" "$EVENT_SHA"
    for path in .github/scripts/product-browser-check.py .github/scripts/product-browser-check-test.py packages/tests/helpers/sdk-auth/run.py packages/tests/helpers/sdk-auth/selected_auth.py; do
      current=$(git rev-parse --verify "${EVENT_SHA}:${path}")
      candidate=$(git rev-parse --verify "${sha}:${path}" 2>/dev/null) || { echo "Recovery unsupported: missing current browser harness (${path})." >&2; exit 1; }
      [[ "$current" == "$candidate" ]] || { echo "Recovery unsupported: browser harness differs (${path})." >&2; exit 1; }
    done
    git checkout --detach "$sha"
    [[ "$(git rev-parse HEAD)" == "$sha" ]]
  fi
elif [[ -n "$CLI_RECOVERY" || -n "$GENERATOR_RECOVERY" ]]; then
  echo "Recovery requires the publication workflow." >&2; exit 1
fi
printf 'sha=%s\n' "$sha" >> "$GITHUB_OUTPUT"
