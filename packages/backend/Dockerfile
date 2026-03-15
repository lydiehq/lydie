FROM mirror.gcr.io/oven/bun:1.3.8 AS deps

WORKDIR /app

COPY ./package.json ./
COPY ./bun.lock ./
COPY ./tsconfig.json ./
COPY ./packages/core/package.json ./packages/core/package.json
COPY ./packages/backend/package.json ./packages/backend/package.json
COPY ./packages/database/package.json ./packages/database/package.json
COPY ./packages/integrations/package.json ./packages/integrations/package.json
COPY ./packages/zero/package.json ./packages/zero/package.json
COPY ./packages/editor/package.json ./packages/editor/package.json

RUN bun install --ignore-scripts --production

FROM mirror.gcr.io/oven/bun:1.3.8

ARG INSTALL_CONVERSION_DEPS=true

RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    curl \
    && if [ "$INSTALL_CONVERSION_DEPS" = "true" ]; then \
    apt-get install -y \
    --no-install-recommends \
    pandoc \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-fonts-recommended \
    ; fi \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/bun.lock ./bun.lock
COPY --from=deps /app/tsconfig.json ./tsconfig.json
COPY --from=deps /app/packages/core/package.json ./packages/core/package.json
COPY --from=deps /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=deps /app/packages/database/package.json ./packages/database/package.json
COPY --from=deps /app/packages/integrations/package.json ./packages/integrations/package.json
COPY --from=deps /app/packages/zero/package.json ./packages/zero/package.json
COPY --from=deps /app/packages/editor/package.json ./packages/editor/package.json

COPY ./packages/backend ./packages/backend
COPY ./packages/core ./packages/core
COPY ./packages/database ./packages/database
COPY ./packages/integrations ./packages/integrations
COPY ./packages/zero ./packages/zero
COPY ./packages/editor ./packages/editor

WORKDIR /app/packages/backend

CMD ["bun", "run", "./src/index.ts"]
