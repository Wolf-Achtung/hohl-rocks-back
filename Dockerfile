# hohl.rocks API – Docker (multi-stage)
FROM node:20-slim AS base
ENV NODE_ENV=production
WORKDIR /app

# Install dependencies
COPY api/package.json ./api/package.json
RUN cd api && npm ci --omit=dev || npm i --omit=dev

# Copy sources
COPY api ./api

# Run
EXPOSE 8080
CMD ["node","api/server/index.js"]
