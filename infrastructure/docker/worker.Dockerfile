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
# Minimal liveness endpoint (no business API). Readiness is /health/ready (DB + Redis).
ENV WORKER_HEALTH_PORT=8081
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s   CMD wget -qO- "http://127.0.0.1:${WORKER_HEALTH_PORT}/health/live" > /dev/null || exit 1
# SIGTERM → graceful shutdown (stop claiming, drain active jobs, close Redis and DB).
STOPSIGNAL SIGTERM
CMD ["node", "dist/index.js"]
