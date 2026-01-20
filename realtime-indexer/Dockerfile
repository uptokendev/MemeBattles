FROM node:20-bookworm-slim

# Install CA certificates (critical for TLS trust)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (cache-friendly)
COPY package*.json ./
RUN npm ci

# Copy the rest of the service code (context is realtime-indexer/)
COPY . .

# Build TypeScript -> dist/
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start"]
