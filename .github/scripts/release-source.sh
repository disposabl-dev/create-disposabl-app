#!/usr/bin/env bash

# Product Android releases are immutable queued main builds. Other artifacts
# and PR updates retain their current-head requirement.
verify_release_source() {
  local platform=${1:?platform required} context=${2:-build} comparison path
  if [[ "$platform" == android && "${CHANNEL:-}" == production && "${GH_REPO:-}" == disposabl-dev/create-disposabl-app && "${GITHUB_EVENT_NAME:-}" == push ]]; then
    [[ "${GITHUB_REF:-}" == refs/heads/main && "${SOURCE:-}" =~ ^[0-9a-f]{40}$ && "${GITHUB_SHA:-}" == "$SOURCE" ]] || { echo 'Invalid queued Android source' >&2; return 1; }
    # The artifact publisher deliberately executes trusted main scripts instead
    # of the build checkout. Its source still must match the originating event.
    if [[ "$context" != publish ]]; then
      comparison=$(git rev-parse HEAD) || return 1
      [[ "$comparison" == "$SOURCE" ]] || { echo 'Android checkout source mismatch' >&2; return 1; }
    fi
    comparison=$(gh api "repos/$GH_REPO/compare/$SOURCE...main" --jq .status) || return 1
    case "$comparison" in
      ahead|identical) return 0 ;;
      *) echo 'Queued Android source is no longer on main' >&2; return 1 ;;
    esac
  fi
  if [[ "$context" == publish ]]; then
    if [[ "$CHANNEL" == production ]]; then path=git/ref/heads/main; else path="pulls/${PR:?PR required}"; fi
  else
    path=${SOURCE_PATH:?source path required}
  fi
  comparison=$(gh api "repos/$GH_REPO/$path" --jq 'if has("head") then (if .state == "open" then .head.sha else "closed" end) else .object.sha end') || return 1
  [[ "$comparison" == "$SOURCE" ]]
}
