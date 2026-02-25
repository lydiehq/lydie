# Multi-stage build for web SPA
FROM oven/bun:1.3.9 AS builder

WORKDIR /app

# Copy workspace files
COPY package.json bun.lock ./
COPY tsconfig.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/editor/package.json ./packages/editor/package.json
COPY packages/web/package.json ./packages/web/package.json
COPY packages/zero/package.json ./packages/zero/package.json
COPY packages/integrations/package.json ./packages/integrations/package.json
COPY packages/scripts/package.json ./packages/scripts/package.json
COPY packages/backend/package.json ./packages/backend/package.json

# Install dependencies
RUN bun install --ignore-scripts

# Copy source code
COPY packages/core ./packages/core
COPY packages/database ./packages/database
COPY packages/ui ./packages/ui
COPY packages/editor ./packages/editor
COPY packages/web ./packages/web
COPY packages/zero ./packages/zero
COPY packages/integrations ./packages/integrations
COPY packages/scripts ./packages/scripts
COPY packages/backend ./packages/backend

# Build arguments for environment variables
# Defaults point to the nginx reverse proxy origin (same host)
ARG VITE_API_URL=http://localhost:3000
ARG VITE_ZERO_URL=http://localhost:3000
ARG VITE_YJS_SERVER_URL=ws://localhost:3000/yjs

# Set build-time environment variables
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_ZERO_URL=${VITE_ZERO_URL}
ENV VITE_YJS_SERVER_URL=${VITE_YJS_SERVER_URL}

# Build the web app
WORKDIR /app/packages/web
RUN bun run build

# Production stage with nginx
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html

# Copy nginx configuration (includes reverse proxy for API/Zero)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
