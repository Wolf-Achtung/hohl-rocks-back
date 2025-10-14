FROM node:22-alpine
WORKDIR /app

# package aus api/ verwenden
COPY api/package.json ./package.json
RUN npm install --omit=dev

# Servercode aus api/ kopieren
COPY api/server ./server

EXPOSE 8080
CMD ["node", "server/index.js"]
