
# hohl.rocks-back (clean) — Node 20
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app

# Install only api deps first (cache-friendly)
COPY api/package.json ./api/package.json
RUN cd api && npm install --omit=dev

# Copy sources
COPY api ./api

EXPOSE 8080
CMD ["node","api/server/index.js"]
