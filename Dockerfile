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
COPY tools/migrate/package.json tools/migrate/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24.21.0-slim AS web
LABEL org.opencontainers.image.source=https://github.com/tomyka/sportbet_new
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
# A future apps/web/public must be copied too (Next does not bundle it into
# .next/standalone): COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM node:24.21.0-slim AS migrate
LABEL org.opencontainers.image.source=https://github.com/tomyka/sportbet_new
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/packages/db/dist ./dist
COPY --from=build /repo/packages/db/migrations ./migrations
USER node
CMD ["node", "dist/migrate.mjs"]
