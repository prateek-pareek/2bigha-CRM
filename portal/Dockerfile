# Debian slim: Tailwind v4 → lightningcss needs a glibc native binary; Alpine (musl) fails with
# "Cannot find module '../lightningcss.linux-x64-musl.node'" during `next build`.
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# The shared UI kit must land first: portal/package.json references it as
# "file:../packages/ui", so npm needs it on disk before it can link it.
COPY packages/ ./packages/

WORKDIR /app/portal

# Copy package files
COPY portal/package*.json ./

# Install deps, then force Tailwind/lightningcss native addons in one layer (npm #4828 / legacy-peer-deps can skip optionals).
RUN npm install --legacy-peer-deps && \
    npm install \
      lightningcss-linux-x64-gnu@1.32.0 \
      @tailwindcss/oxide-linux-x64-gnu@4.2.2 \
      --legacy-peer-deps --no-save

# Copy source code
COPY portal/ ./

# Accept build-time args (Next inlines NEXT_PUBLIC_* into the client bundle)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WEBRTC_ICE_SERVERS
ENV NEXT_PUBLIC_WEBRTC_ICE_SERVERS=$NEXT_PUBLIC_WEBRTC_ICE_SERVERS
# Standalone CRM deploy: `/` dispatches straight to /crm/workspace instead of the
# suite's default route. Read at build time by src/app/page.tsx, so it MUST be an
# ARG here — compose passes it, but without this line Next inlined `undefined`.
ARG NEXT_PUBLIC_CRM_STANDALONE
ENV NEXT_PUBLIC_CRM_STANDALONE=$NEXT_PUBLIC_CRM_STANDALONE
# Only set when the CRM API lives on a different host than NEXT_PUBLIC_API_URL.
# Must include the /api suffix (config.ts falls back to `${NEXT_PUBLIC_API_URL}/api`).
ARG NEXT_PUBLIC_CRM_API_URL
ENV NEXT_PUBLIC_CRM_API_URL=$NEXT_PUBLIC_CRM_API_URL

# Build the application
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# Stage 2: Production
FROM node:20-bookworm-slim

WORKDIR /app/portal

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy from builder
COPY --from=builder /app/packages ../packages
COPY --from=builder /app/portal/package*.json ./
COPY --from=builder /app/portal/node_modules ./node_modules
COPY --from=builder /app/portal/.next ./.next
COPY --from=builder /app/portal/public ./public
COPY --from=builder /app/portal/next.config.ts ./next.config.ts

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "run", "start"]
