# Railway Node runtime
FROM node:20-alpine

WORKDIR /app
COPY api/package.json ./
RUN npm install --only=production
COPY api/server ./server

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/index.js"]
