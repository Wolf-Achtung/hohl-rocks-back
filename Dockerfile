FROM node:20-slim

ENV NODE_ENV=production     PORT=8080

WORKDIR /app
COPY api/package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY api ./

EXPOSE 8080
CMD ["node","server/index.js"]
