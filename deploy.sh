#!/usr/bin/env bash
#
# Deploy the ChatAndTip web app to Railway (new account: melodious-spirit).
#
# The GitHub repo is NOT connected to this Railway project (it lives under a
# different account), so deploys are pushed directly from source with
# `railway up` rather than triggered by a git push.
#
# Usage:
#   ./deploy.sh              # build sanity-check, then railway up
#   ./deploy.sh --db         # also run `prisma db push` before deploying
#   ./deploy.sh --skip-build # skip the local build check (faster, riskier)
#   ./deploy.sh --db --skip-build
#
set -euo pipefail

cd "$(dirname "$0")"

RUN_DB_PUSH=false
RUN_BUILD=true
for arg in "$@"; do
  case "$arg" in
    --db)         RUN_DB_PUSH=true ;;
    --skip-build) RUN_BUILD=false ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

echo "▸ Checking Railway link…"
if ! railway status >/dev/null 2>&1; then
  echo "✗ No Railway project linked. Run: railway link" >&2
  exit 1
fi
railway status | sed -n '1,6p'

# ── 1. Local build check ─────────────────────────────────────────────
# Compile with the production env so TypeScript/Prisma errors surface here
# instead of after a slow remote upload+build cycle.
if [ "$RUN_BUILD" = true ]; then
  if [ ! -f .env.railway ]; then
    echo "✗ .env.railway not found — needed for the local build check." >&2
    echo "  Run with --skip-build to bypass, or create the file." >&2
    exit 1
  fi
  echo "▸ Running local production build (catches errors before uploading)…"
  npm run build:railway-local
  echo "✓ Local build passed"
fi

# ── 2. Schema push (opt-in) ──────────────────────────────────────────
# `prisma db push` can drop columns, so it is opt-in via --db rather than
# running on every deploy. Targets the DATABASE_URL in .env.railway.
if [ "$RUN_DB_PUSH" = true ]; then
  echo "▸ Pushing Prisma schema to the database…"
  node scripts/with-env-file.mjs .env.railway npx prisma db push
  echo "✓ Schema in sync"
fi

# ── 3. Deploy ────────────────────────────────────────────────────────
echo "▸ Uploading source to Railway (railway up)…"
railway up

echo "✓ Deploy triggered. Watch logs with:  railway logs"
