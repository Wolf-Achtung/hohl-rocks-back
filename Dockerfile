# Build a tiny Node image
FROM node:20-alpine

WORKDIR /app

# Copy API sources
COPY api/package.json ./api/package.json
RUN cd api && npm ci --omit=dev

COPY api/server ./api/server

ENV PORT=8080
EXPOSE 8080

CMD ["node", "api/server/index.js"]