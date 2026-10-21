# Two runtime images from one build: `web` (the Next.js server) and `migrate`
# (migrations and the staging seed). Built natively on the arm64 runner.
#
# The node tag is pinned exactly, matching .nvmrc; postgres:18.x (app.yml,
# packages/db/src/migrations.ts, backup.sh) and caddy:2.x.y (edge.yml) are
# bumped deliberately together with it.

FROM node:24.21.0-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY package.json ./
# The pnpm version is the one package.json pins in packageManager.
RUN npm install -g "$(node -p "require('./package.json').packageManager")"
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm -r build

FROM node:24.21.0-slim AS web
# Debian security fixes the pinned node image has not picked up yet (the Trivy
# gate in ci.yml fails the release on a fixable CRITICAL one). Runs as root,
# before the USER switch and before any app file is copied, so the layer is
# cached until the base or the Debian archive moves.
RUN apt-get update \
  && apt-get -y --no-install-recommends upgrade \
  && rm -rf /var/lib/apt/lists/*
LABEL org.opencontainers.image.source=https://github.com/tomyka/sportbet_new
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# The commit this image is built from (CI passes the sha); /api/version names it
# and the production deploy compares it with the tag it deployed. Declared late
# so a new commit does not invalidate the layers above.
ARG APP_COMMIT=unknown
ENV APP_COMMIT=$APP_COMMIT
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
# Next does not bundle public/ into .next/standalone: sportbet's logo and
# favicons (slice 4a).
COPY --from=build /repo/apps/web/public ./apps/web/public
# The one directory the server writes at run time: Next's prerender cache and
# the data cache behind unstable_cache (the leaderboard). The standalone tree is
# root-owned, so without this mkdir fails with EACCES for `node`. It lives in
# the container's own layer and starts empty on every deploy, which is enough:
# the caches are rebuilt on demand.
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM node:24.21.0-slim AS migrate
# Same security upgrade as web, above.
RUN apt-get update \
  && apt-get -y --no-install-recommends upgrade \
  && rm -rf /var/lib/apt/lists/*
LABEL org.opencontainers.image.source=https://github.com/tomyka/sportbet_new
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/packages/db/dist ./dist
COPY --from=build /repo/packages/db/migrations ./migrations
USER node
CMD ["node", "dist/migrate.mjs"]
