#!/usr/bin/env bash
set -euo pipefail

case "${1:?operation required}" in
  prepare)
    df -Pk .
    # Only disposable GitHub-hosted Linux runners. Keep Android, Java, Node,
    # the checkout and dependency caches intact; these toolchains are unused.
    if [[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted && "${RUNNER_OS:-}" == Linux ]]; then
      unused=(/usr/share/dotnet /usr/local/.ghcup /opt/ghc /opt/hostedtoolcache/CodeQL
        /usr/share/swift /usr/share/miniconda /opt/microsoft/powershell /usr/local/share/powershell
        /usr/local/share/vcpkg /home/linuxbrew)
      du -sk -- "${unused[@]}" 2>/dev/null || true
      sudo rm -rf -- "${unused[@]}"
    fi
    df -Pk .
    ;;
  check)
    df -Pk .
    available=$(df -Pk . | awk 'END {print $4}')
    if [[ ! "$available" =~ ^[0-9]+$ ]] || (( available < 25 * 1024 * 1024 )); then
      echo '::error::Android native builds require at least 25 GiB free before prebuild. Use a runner with more disk capacity.' >&2
      exit 1
    fi
    ;;
  *) echo "Unknown operation: $1" >&2; exit 1 ;;
esac
