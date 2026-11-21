#!/usr/bin/env bash
set -euo pipefail

valid_node() {
  local node="$1" version major minor patch arch
  [[ -x "$node" ]] || return 1
  version=$("$node" -p '`${process.versions.node} ${process.arch}`' 2>/dev/null) || return 1
  read -r version arch <<< "$version"
  IFS=. read -r major minor patch <<< "$version"
  [[ "$major" == 24 && "$minor" =~ ^[0-9]+$ && "$patch" =~ ^[0-9]+$ ]] || return 1
  (( minor >= 8 )) || return 1
  [[ "$arch" == "$node_arch" ]]
}

case "${RUNNER_ARCH:-}" in
  X64) node_arch=x64 ;;
  ARM64) node_arch=arm64 ;;
  *) echo 'Unsupported or absent runner architecture; using setup-node.'; exit 0 ;;
esac

candidate=$(command -v node || true)
if [[ -n "$candidate" ]] && valid_node "$candidate"; then
  echo "Using Node 24 from PATH: $candidate"
  echo 'ready=true' >> "$GITHUB_OUTPUT"
  exit 0
fi

shopt -s nullglob
candidates=("${RUNNER_TOOL_CACHE:-/nonexistent}"/node/24.*/"$node_arch"/bin/node)
if (( ${#candidates[@]} )); then
  while IFS= read -r candidate; do
    [[ -f "${candidate%/bin/node}.complete" ]] || continue
    if valid_node "$candidate"; then
      echo "Using preinstalled Node 24: $candidate"
      printf '%s\n' "${candidate%/node}" >> "$GITHUB_PATH"
      echo 'ready=true' >> "$GITHUB_OUTPUT"
      exit 0
    fi
  done < <(printf '%s\n' "${candidates[@]}" | sort -Vr)
fi

echo 'No eligible preinstalled Node 24; using setup-node.'
