#!/usr/bin/env bash
#
# Prints staging's address, https://<domain>: the Vercel project's verified
# production *.vercel.app domain (not a redirect). The deployment's own URL
# sits behind Vercel's deployment protection; this domain is public and stable.
# Needs VERCEL_TOKEN, VERCEL_PROJECT_ID and VERCEL_ORG_ID in the environment.
# Nothing but the address goes to stdout.
set -euo pipefail

domains="$(curl -fsS -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID/domains?production=true&redirects=false&teamId=$VERCEL_ORG_ID")"
domain="$(jq -r '[.domains[] | select(.verified and (.name | endswith(".vercel.app")))][0].name // empty' <<< "$domains")"
if [ -z "$domain" ]; then
  echo "::error::The project has no verified *.vercel.app production domain." >&2
  exit 1
fi
echo "https://$domain"
