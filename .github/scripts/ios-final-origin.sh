#!/bin/bash
set -euo pipefail
api="repos/$GITHUB_REPOSITORY/actions"
run=$(gh api "$api/runs/$RUN")
job=$(gh api "$api/jobs/$JOB")
jq -e --arg sha "$EXPECTED_SHA" --argjson attempt "$ATTEMPT" '.head_sha == $sha and .run_attempt == $attempt and .event == "pull_request" and .path == ".github/workflows/pipeline.yml" and .head_repository.full_name == "disposabl-dev/create-disposabl-app" and any(.pull_requests[]?; .number == 92)' <<<"$run" >/dev/null
jq -e --argjson run "$RUN" --argjson attempt "$ATTEMPT" --arg sha "$EXPECTED_SHA" '.run_id == $run and .run_attempt == $attempt and .head_sha == $sha and .name == "iOS simulator preview" and .conclusion == "success"' <<<"$job" >/dev/null
artifact=$(gh api "$api/artifacts/$ARTIFACT_ID")
jq -e --argjson id "$ARTIFACT_ID" --argjson run "$RUN" --arg digest "sha256:$EXPECTED_DIGEST" '.id == $id and .name == "ios-simulator" and .expired == false and .digest == $digest and .workflow_run.id == $run' <<<"$artifact" >/dev/null
mkdir -p "$RUNNER_TEMP/ios-smoke-evidence"
jq -n --arg run "$RUN" --arg attempt "$ATTEMPT" --arg sha "$EXPECTED_SHA" --arg job "$JOB" --arg id "$ARTIFACT_ID" --arg digest "$EXPECTED_DIGEST" '{run:$run,attempt:$attempt,head_sha:$sha,job:$job,artifact_id:$id,artifact_sha256:$digest}' > "$RUNNER_TEMP/ios-smoke-evidence/origin.json"
