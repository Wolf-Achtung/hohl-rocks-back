# Use a stable Node base image.  We rely on the public AWS ECR mirror of official images to avoid rate limits
FROM public.ecr.aws/docker/library/node:20-bookworm-slim

# Set working directory
WORKDIR /app

# Install dependencies for the API.  Copy only package.json first to leverage layer caching
COPY api/package.json ./api/package.json
RUN set -ex \
  && cd /app/api \
  && npm install --omit=dev

# Copy application source
COPY api /app/api

# Environment configuration
ENV NODE_ENV=production PORT=8080

# Expose the service port
EXPOSE 8080

# Run the server.  We avoid using a package manager here to keep the runtime lean.
CMD ["node", "/app/api/server/server.js"]