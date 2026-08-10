# Debian slim: Tailwind v4 → lightningcss needs a glibc native binary; Alpine (musl) fails with
# "Cannot find module '../lightningcss.linux-x64-musl.node'" during `next build`.
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install deps, then force Tailwind/lightningcss native addons in one layer (npm #4828 / legacy-peer-deps can skip optionals).
RUN npm install --legacy-peer-deps && \
    npm install \
      lightningcss-linux-x64-gnu@1.32.0 \
      @tailwindcss/oxide-linux-x64-gnu@4.2.2 \
      --legacy-peer-deps --no-save

# Copy source code
COPY . .

# Accept build-time args (Next inlines NEXT_PUBLIC_* into the client bundle)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WEBRTC_ICE_SERVERS
ENV NEXT_PUBLIC_WEBRTC_ICE_SERVERS=$NEXT_PUBLIC_WEBRTC_ICE_SERVERS

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "run", "start"]
