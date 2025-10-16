FROM node:20-slim AS base
ENV NODE_ENV=production
WORKDIR /app
COPY api/package.json ./api/package.json
RUN cd api && npm ci --omit=dev || npm i --omit=dev
COPY api ./api
EXPOSE 8080
CMD ["node","api/server/index.js"]
