#!/bin/bash
set -euo pipefail
api="repos/$GITHUB_REPOSITORY/actions"
run=$(gh api "$api/runs/44913592240")
job=$(gh api "$api/jobs/136874582703")
artifact=$(gh api "$api/artifacts/14710542777")
sha=c992b5379aca353648c007ec3b97c6ced6b2880a
digest=sha256:c742c0616f01ac656102bd9c9efb82e2feb7624a901b8bc64f86446751558741
jq -e --arg sha "$sha" '.head_sha == $sha and .run_attempt == 1 and .event == "push" and .head_repository.full_name == "disposabl-dev/create-disposabl-app" and .head_branch == "benchmark/generated-ios-warm-20261121" and .path == ".github/workflows/generated-ios-warm.yml"' <<<"$run" >/dev/null
jq -e --arg sha "$sha" '.run_id == 44913592240 and .run_attempt == 1 and .head_sha == $sha and .name == "warm" and any(.steps[]; .number == 11 and .name == "Repack current JS and counters" and .conclusion == "success") and any(.steps[]; .number == 12 and .name == "Run actions/upload-artifact@v7" and .conclusion == "success")' <<<"$job" >/dev/null
jq -e --arg sha "$sha" --arg digest "$digest" '.id == 14710542777 and .name == "generated-ios-archive" and .digest == $digest and .expired == false and .workflow_run.id == 44913592240 and .workflow_run.head_sha == $sha' <<<"$artifact" >/dev/null
mkdir -p "$RUNNER_TEMP/ios-smoke-evidence"
printf 'run=44913592240\nattempt=1\njob=136874582703\nhead=%s\nartifact=14710542777\ndigest=%s\n' "$sha" "$digest" > "$RUNNER_TEMP/ios-smoke-evidence/origin.txt"
