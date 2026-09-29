# syntax=docker/dockerfile:1
# Web image. Build from the repository root:
#   docker build -f infrastructure/docker/web.Dockerfile \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t crm-web .
# NEXT_PUBLIC_* values are inlined at build time, so they are build args, not runtime env.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY . .
RUN pnpm install --frozen-lockfile --filter "@crm/web..."
RUN pnpm --filter "@crm/web..." run build
RUN pnpm install --frozen-lockfile --prod --filter "@crm/web..."

FROM node:22-alpine AS runtime
# Build metadata (reported by /api/v1, X-CRM-Version, logs and crm_build_info).
ARG APP_VERSION=0.0.0-dev
ARG GIT_SHA=dev
ARG BUILD_TIME
LABEL org.opencontainers.image.version=$APP_VERSION org.opencontainers.image.revision=$GIT_SHA org.opencontainers.image.created=$BUILD_TIME org.opencontainers.image.source="https://github.com/vercentlabs/CRM"
ENV NODE_ENV=production APP_VERSION=$APP_VERSION GIT_SHA=$GIT_SHA BUILD_TIME=$BUILD_TIME
WORKDIR /repo
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/apps/web ./apps/web
WORKDIR /repo/apps/web
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
