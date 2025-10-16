FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app

# Install deps for api
COPY api/package.json ./api/package.json
RUN cd api && npm ci --omit=dev || npm i --omit=dev

# Copy sources
COPY api ./api

EXPOSE 8080
CMD ["node","api/server/index.js"]
