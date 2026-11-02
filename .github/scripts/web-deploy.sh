#!/usr/bin/env bash
set -euo pipefail
if [[ "$TRUSTED" != true ]]; then VITE_CONVEX_URL=https://ci.invalid VITE_CONVEX_SITE_URL=https://ci.invalid bun run build --filter=@disposabl/web; exit; fi
: "${CONVEX_DEPLOY_KEY:?Configure the Convex deployment secret for this repository}"
cd packages/backend
export AUTH_TARGET=--prod
target=()
if [[ "$CHANNEL" != production ]]; then export AUTH_TARGET="--preview-name $CHANNEL"; target=(--preview-name "$CHANNEL"); fi
bun x --no-install convex deploy --yes "${target[@]}" --cmd-url-env-var-name CONVEX_URL --cmd 'for name in CONVEX_URL CONVEX_SITE_URL; do value=$(printenv "$name"); test -n "$value" || exit 1; for prefix in "" VITE_ EXPO_PUBLIC_; do export "$prefix$name=$value"; printf "%s=%s\n" "$prefix$name" "$value" | tee -a "$GITHUB_ENV" >> "$GITHUB_OUTPUT"; done; done; bun x --no-install --package @convex-dev/auth auth --keys-only $AUTH_TARGET && bun run --cwd ../.. build --filter=@disposabl/web'
bun x --no-install static-hosting upload $AUTH_TARGET --no-spa --dist ../../apps/web/dist/client
