# Base image
FROM node:20-alpine AS builder

# Bundled Chromium from npm is built for glibc and will not run on Alpine (musl).
# Skip the download here; the runtime image installs Alpine's chromium package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (+ sharp musl binary for Alpine runtime)
RUN npm install && \
    npm install @img/sharp-linuxmusl-x64@0.34.5 --no-save

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    vips

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# Expose port
EXPOSE 4000

# Start command
CMD ["npm", "run", "start:prod"]
