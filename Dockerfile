# syntax=docker/dockerfile:1
FROM node:20-alpine
WORKDIR /app
COPY api/package.json ./package.json
RUN npm install --omit=dev
COPY api ./
EXPOSE 8080
ENV PORT=8080 NODE_ENV=production
CMD ["npm","start"]
