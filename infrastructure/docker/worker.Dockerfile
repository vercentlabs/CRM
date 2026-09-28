# syntax=docker/dockerfile:1
# Worker image. Build from the repository root:
#   docker build -f infrastructure/docker/worker.Dockerfile -t crm-worker .

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter "@crm/worker..."
RUN pnpm --filter "@crm/worker..." run build
RUN pnpm install --frozen-lockfile --prod --filter "@crm/worker..."

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/apps/worker ./apps/worker
WORKDIR /repo/apps/worker
USER node
CMD ["node", "dist/index.js"]
