#!/usr/bin/env bash
set -euo pipefail

target=(--prod)
deploy_args=(--yes --cmd-url-env-var-name CONVEX_URL)
if [[ "$CHANNEL" != production ]]; then
  target=(--preview-name "$CHANNEL")
  deploy_args+=("${target[@]}")
fi

case "${1:?operation required}" in
  predeploy)
    for name in CONVEX_URL CONVEX_SITE_URL; do
      value=$(printenv "$name")
      test -n "$value"
      printf '%s=%s\n' "$name" "$value" | tee -a "$GITHUB_ENV" >> "$GITHUB_OUTPUT"
    done
    if node -e 'process.exit(require("../../disposabl.json").appId ? 0 : 1)'; then
      node ../../.github/scripts/disposabl.mjs site
      PUBLIC_SITE_URL=$(sed -n 's/^PUBLIC_SITE_URL=//p' "$GITHUB_OUTPUT" | tail -1)
      : "${PUBLIC_SITE_URL:?Missing public site origin}"
      bun x --no-install convex env set "${target[@]}" PUBLIC_SITE_URL "$PUBLIC_SITE_URL"
    else
      PUBLIC_SITE_URL="$CONVEX_SITE_URL"
      printf 'PUBLIC_SITE_URL=%s\n' "$PUBLIC_SITE_URL" | tee -a "$GITHUB_ENV" >> "$GITHUB_OUTPUT"
    fi
    export PUBLIC_SITE_URL
    for prefix in VITE_ EXPO_PUBLIC_; do
      export "${prefix}CONVEX_URL=$CONVEX_URL" "${prefix}CONVEX_SITE_URL=$PUBLIC_SITE_URL"
      printf '%sCONVEX_URL=%s\n%sCONVEX_SITE_URL=%s\n' "$prefix" "$CONVEX_URL" "$prefix" "$PUBLIC_SITE_URL" >> "$GITHUB_ENV"
    done
    TIMEFORMAT='Web build: %3R s'
    time timeout --kill-after=10s 120s bun x --no-install turbo run build --cwd ../.. --filter=@disposabl/web
    ;;
  deploy)
    : "${CONVEX_DEPLOY_KEY:?Configure the Convex deployment secret for this repository}"
    cd packages/backend
    setup_args='{"expectedEnvironment":"live"}'
    if [[ "$CHANNEL" == production ]]; then
      bun x --no-install convex env set --prod BILLING_ENVIRONMENT live
    elif [[ "$GH_REPO" == disposabl-dev/create-disposabl-app ]]; then
      setup_args='{"expectedEnvironment":"test","allowUnconfiguredPreview":true}'
    else
      setup_args='{"expectedEnvironment":"test"}'
    fi
    TIMEFORMAT='Convex deploy (including Web build): %3R s'
    time bun x --no-install convex deploy "${deploy_args[@]}" \
      --cmd 'bash "$GITHUB_WORKSPACE/.github/scripts/web.sh" predeploy'
    TIMEFORMAT='Billing setup: %3R s'
    time bun x --no-install convex run "${target[@]}" billing:setup "$setup_args"
    TIMEFORMAT='Static upload: %3R s'
    time bun --bun x --no-install static-hosting upload "${target[@]}" --concurrency 12 --no-spa --dist ../../apps/web/dist/client
    ;;
  *) echo "Unknown operation: $1" >&2; exit 1 ;;
esac
