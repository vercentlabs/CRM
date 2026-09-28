# syntax=docker/dockerfile:1
# API image. Build from the repository root:
#   docker build -f infrastructure/docker/api.Dockerfile -t crm-api .
# Runtime configuration comes from env vars (see apps/api/.env.example); none are baked in.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter "@crm/api..."
# Builds @crm/api and the workspace packages it depends on, in dependency order.
RUN pnpm --filter "@crm/api..." run build
# Drop devDependencies; workspace symlinks stay relative so the tree can be copied as-is.
RUN pnpm install --frozen-lockfile --prod --filter "@crm/api..."

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/apps/api ./apps/api
WORKDIR /repo/apps/api
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-5000}/api/v1/health/live" > /dev/null || exit 1
CMD ["node", "dist/server.js"]
