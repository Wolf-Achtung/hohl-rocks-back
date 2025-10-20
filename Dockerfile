# syntax=docker/dockerfile:1.7
#
# Robust Dockerfile for Railway that avoids Docker Hub auth hiccups (503/ratelimits)
# by defaulting to the AWS ECR Public mirror of the official Node image.
#
# Override BASE_IMAGE in Railway build args if needed, e.g.:
#   BASE_IMAGE=docker.io/library/node:20-bookworm-slim
#   BASE_IMAGE=public.ecr.aws/docker/library/node:20-bookworm-slim   (default)
#
ARG BASE_IMAGE=public.ecr.aws/docker/library/node:20-bookworm-slim
FROM ${BASE_IMAGE} AS base

ENV NODE_ENV=production         PORT=8080         # Ensure non-interactive apt and reliable timezone
    DEBIAN_FRONTEND=noninteractive         TZ=Etc/UTC

# System deps: tini for proper PID1, curl for health checks if needed
RUN apt-get update -y && apt-get install -y --no-install-recommends \ 
    ca-certificates tini curl         && rm -rf /var/lib/apt/lists/*

# Create app dir and use non-root user
WORKDIR /app
RUN useradd -m -u 10001 appuser && chown -R appuser:appuser /app
USER appuser

# Enable Corepack and pin npm cache
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable || true
ENV NPM_CONFIG_UPDATE_NOTIFIER=false         NPM_CONFIG_FUND=false

# --- Install only API deps first (better layer caching) ---
# Adjust paths if your api/ directory differs
COPY --chown=appuser:appuser api/package.json api/package-lock.json* ./api/
WORKDIR /app/api
# Use build cache for faster CI
RUN --mount=type=cache,target=/home/appuser/.npm         npm ci --omit=dev

# --- Copy application source ---
COPY --chown=appuser:appuser api ./

# Ensure health endpoints are present; if not, server should 200 on /healthz
EXPOSE 8080

# Add a simple Dockerfile-level healthcheck (adjust path if needed)
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3       CMD curl -fsS http://127.0.0.1:${PORT}/healthz || exit 1

# Use tini for proper signal handling on Railway
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","server.js"]
