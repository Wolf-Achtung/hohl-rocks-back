
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app

# Only package.json first (layer cache)
COPY api/package.json ./api/package.json

# Install deps (no npm ci -> no lockfile required)
RUN cd api && npm install --omit=dev

# Copy sources
COPY api ./api

EXPOSE 8080
CMD ["node","api/server/index.js"]
