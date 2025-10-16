FROM node:20-alpine

WORKDIR /app

# Install only production deps from api/package.json
COPY api/package.json ./api/package.json
RUN cd /app/api && npm ci --omit=dev || npm i --omit=dev

# Copy source
COPY api /app/api

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Single, unambiguous entrypoint
CMD ["node","api/server/index.js"]
