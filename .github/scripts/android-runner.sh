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
    now=$(date +%s)
    start=${ANDROID_PRIME_STARTED_AT:-}
    [[ "$start" =~ ^[0-9]+$ ]] && (( start <= now )) || { echo 'Missing or invalid warmup start time.' >&2; exit 1; }
    # The first step records the start; leave four minutes for setup-job overhead,
    # signal handling, cache uploads and setup-gradle post-job cleanup.
    remaining=$((start + 16 * 60 - now))
    (( remaining > 0 )) || { echo 'Insufficient time remaining to compile and save cache.' >&2; exit 1; }
    echo "Native compilation budget: ${remaining}s; four-minute reserve from first-step start for job overhead and cache saving."
    timeout --signal=INT --kill-after=15s "${remaining}s" ./gradlew :app:externalNativeBuildRelease --no-daemon --build-cache
    ccache --show-stats
    result=$(find "${CCACHE_DIR:?}" -type f -name '*R' -size +0c -print -quit)
    [[ -n "$result" ]] || { echo 'No compiler result was cached.' >&2; exit 1; }
    inspection=$(ccache --inspect "$result")
    [[ "$inspection" == *' (result)'* ]] || { echo 'Invalid compiler result.' >&2; exit 1; }
    ;;
  *) echo "Unknown operation: $1" >&2; exit 1 ;;
esac
