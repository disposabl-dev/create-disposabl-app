#!/usr/bin/env bash
set -euo pipefail

case "${1:?operation required}" in
  prepare)
    df -Pk .
    available=$(df -Pk . | awk 'END {print $4}')
    # Only disposable GitHub-hosted Linux runners. Keep Android, Java, Node,
    # the checkout and dependency caches intact; these toolchains are unused.
    if [[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted && "${RUNNER_OS:-}" == Linux && "$available" =~ ^[0-9]+$ ]] && (( available < 25 * 1024 * 1024 )); then
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
  build)
    # Keep aggregate CPU/memory samples in the job log, including interrupted builds.
    # Do not print process arguments or environment values, which can contain secrets.
    sampler=""
    trap 'if [[ -n "$sampler" ]]; then kill "$sampler" 2>/dev/null || true; wait "$sampler" 2>/dev/null || true; fi' EXIT
    if [[ "${RUNNER_OS:-}" == Linux ]] && command -v vmstat >/dev/null; then
      printf 'Android runner processors: %s\n' "$(getconf _NPROCESSORS_ONLN)"
      vmstat -w -t 15 &
      sampler=$!
    fi
    TIMEFORMAT='Gradle elapsed: %3R seconds; shell and child CPU: %3U user, %3S system'
    status=0
    time ./gradlew :app:assembleRelease --no-daemon --build-cache || status=$?
    if [[ -n "${CCACHE_DIR:-}" ]]; then ccache --show-stats; fi
    exit "$status"
    ;;
  prime)
    status=0
    timeout --signal=INT --kill-after=15s 16m ./gradlew :app:externalNativeBuildRelease --no-daemon --build-cache || status=$?
    ccache --show-stats
    if [[ "$status" != 0 && "$status" != 124 ]]; then exit "$status"; fi
    if [[ "$status" == 124 ]]; then echo 'Native warmup reached its time budget; saving completed compiler entries.'; fi
    misses=$(ccache --print-stats | awk '$1 == "cache_miss" {print $2}')
    [[ "$misses" =~ ^[0-9]+$ ]] && (( misses > 0 )) || { echo 'No compiler results were cached.' >&2; exit 1; }
    ;;
  *) echo "Unknown operation: $1" >&2; exit 1 ;;
esac
