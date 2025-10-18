FROM node:20-alpine

WORKDIR /app

# Install deps without requiring a lockfile
COPY api/package.json ./api/package.json
RUN cd /app/api && npm install --omit=dev

# Copy sources
COPY api /app/api

ENV PORT=8080 NODE_ENV=production
EXPOSE 8080

CMD ["node","/app/api/server/index.js"]
