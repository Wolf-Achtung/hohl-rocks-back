FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./package.json
RUN npm ci --omit=dev || npm i --omit=dev
COPY server ./server
EXPOSE 8080
CMD ["node","server/index.js"]