#!/usr/bin/env bash
set -euo pipefail
for ((offset=0; ; offset+=25)); do
  bun x "$EAS_CLI" channel:list --json --limit 25 --offset "$offset" > "$RUNNER_TEMP/channels.json"
  if jq -e --arg channel "$CHANNEL" 'any(.currentPage[]; .name == $channel)' "$RUNNER_TEMP/channels.json" > /dev/null; then
    jq -e --arg channel "$CHANNEL" '.currentPage[] | select(.name == $channel) | (.isPaused == false) and (.updateBranches | length == 1) and (.updateBranches[0].name == $channel) and ((.branchMapping | fromjson).data == [{branchId: .updateBranches[0].id, branchMappingLogic: "true"}])' "$RUNNER_TEMP/channels.json" > /dev/null || { echo 'Preview channel must point only to its same-named branch'; exit 1; }
    break
  fi
  if [[ $(jq '.currentPage | length' "$RUNNER_TEMP/channels.json") -lt 25 ]]; then bun x "$EAS_CLI" channel:create "$CHANNEL" --non-interactive; break; fi
done
