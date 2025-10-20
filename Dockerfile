# syntax=docker/dockerfile:1.7
ARG BASE_IMAGE=public.ecr.aws/docker/library/node:20-bookworm-slim
FROM ${BASE_IMAGE} AS base

ENV NODE_ENV=production         PORT=8080         DEBIAN_FRONTEND=noninteractive         TZ=Etc/UTC

USER root
RUN apt-get update -y && apt-get install -y --no-install-recommends         ca-certificates tini curl         && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN useradd -m -u 10001 appuser && chown -R appuser:appuser /app
USER appuser

# Corepack/NPM sanity
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0         NPM_CONFIG_UPDATE_NOTIFIER=false         NPM_CONFIG_FUND=false

# --- Install deps with BuildKit cache (explicit id to satisfy Railway builder) ---
COPY --chown=appuser:appuser api/package.json api/package-lock.json* ./api/
WORKDIR /app/api
# NOTE: Some builders require an explicit cache id. We provide it here.
RUN --mount=type=cache,target=/home/appuser/.npm,id=npm-cache,sharing=locked         npm ci --omit=dev

# --- Copy source ---
COPY --chown=appuser:appuser api ./

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3       CMD curl -fsS http://127.0.0.1:${PORT}/healthz || exit 1

ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","server.js"]
