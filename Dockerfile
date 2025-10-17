FROM node:20-alpine

WORKDIR /app
COPY api/package.json ./api/package.json
RUN cd /app/api && npm install --only=production

COPY api/server /app/api/server

ENV PORT=8080
EXPOSE 8080
CMD ["node", "api/server/index.js"]
