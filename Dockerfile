# Base image with Chromium and required libs preinstalled
FROM ghcr.io/puppeteer/puppeteer:24.2.0

WORKDIR /app

# Install only production deps; skip re-downloading Chromium
COPY package*.json ./
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --omit=dev

# Copy source
COPY . .

# Default command is inert. Use Railway Cron to run: node index.cjs
CMD ["bash","-lc","sleep infinity"]

