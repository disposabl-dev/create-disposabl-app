#!/bin/bash
set -euo pipefail
api="repos/$GITHUB_REPOSITORY/actions"
run=$(gh api "$api/runs/$RUN")
job=$(gh api "$api/jobs/$JOB")
jq -e --arg sha "$EXPECTED_SHA" '.head_sha == $sha and .run_attempt == 1' <<<"$run" >/dev/null
jq -e --argjson run "$RUN" --arg sha "$EXPECTED_SHA" '.run_id == $run and .head_sha == $sha' <<<"$job" >/dev/null
status=$(jq -r .status <<<"$job")
if [[ "$status" != completed ]]; then
  echo "Origin job $JOB is $status; artifact pending." | tee -a "$GITHUB_STEP_SUMMARY"
  echo 'ready=false' >> "$GITHUB_OUTPUT"
  exit 0
fi
jq -e '.conclusion == "success"' <<<"$job" >/dev/null
artifacts=$(gh api --paginate --slurp "$api/runs/$RUN/artifacts?per_page=100" | jq '[.[].artifacts[]]')
matches=$(jq --arg name "$ARTIFACT" '[.[] | select(.name == $name and .expired == false)]' <<<"$artifacts")
[[ $(jq length <<<"$matches") == 1 ]] || { echo "Expected exactly one unexpired $ARTIFACT artifact" >&2; exit 1; }
id=$(jq -r '.[0].id' <<<"$matches")
digest=$(jq -er '.[0].digest | select(test("^sha256:[a-f0-9]{64}$")) | sub("^sha256:"; "")' <<<"$matches")
mkdir -p "$RUNNER_TEMP/ios-smoke-evidence"
jq -n --arg run "$RUN" --arg sha "$EXPECTED_SHA" --arg job "$JOB" --arg name "$ARTIFACT" --arg id "$id" --arg digest "$digest" '{run:$run, head_sha:$sha, job:$job, artifact_name:$name, artifact_id:$id, artifact_sha256:$digest}' > "$RUNNER_TEMP/ios-smoke-evidence/origin.json"
echo "id=$id" >> "$GITHUB_OUTPUT"
echo "digest=$digest" >> "$GITHUB_OUTPUT"
echo 'ready=true' >> "$GITHUB_OUTPUT"
