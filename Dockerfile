FROM node:20-alpine

WORKDIR /app
COPY api/package.json ./api/package.json
RUN cd /app/api && npm install --omit=dev

COPY api /app/api

ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node","/app/api/server/server.js"]
