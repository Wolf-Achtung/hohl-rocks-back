FROM node:20-slim
WORKDIR /app
COPY api ./api
WORKDIR /app/api
RUN npm ci || npm i --only=prod
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/index.js"]
