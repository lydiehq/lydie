FROM oven/bun:1.3.9

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json bun.lock ./
COPY tsconfig.json ./
COPY infrastructure/package.json ./infrastructure/package.json
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

# Copy source code (will be overridden by volume mounts in dev)
COPY packages/core ./packages/core
COPY packages/database ./packages/database
COPY packages/ui ./packages/ui
COPY packages/editor ./packages/editor
COPY packages/web ./packages/web
COPY packages/zero ./packages/zero
COPY packages/integrations ./packages/integrations
COPY packages/scripts ./packages/scripts
COPY packages/backend ./packages/backend

WORKDIR /app/packages/web

# Expose Vite dev server port and HMR websocket port
EXPOSE 3000
EXPOSE 24678

# Copy integration assets first
RUN bun --filter=@lydie/scripts copy-integration-assets

# Run Vite dev server with HMR enabled
# --host 0.0.0.0 is required to accept connections from outside the container
CMD ["bun", "run", "vite", "--port", "3000", "--host", "0.0.0.0"]
