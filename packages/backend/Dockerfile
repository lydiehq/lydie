FROM mirror.gcr.io/oven/bun:1.3.4

ADD ./package.json .
ADD ./bun.lock .
ADD ./packages/core/package.json ./packages/core/package.json
ADD ./packages/backend/package.json ./packages/backend/package.json
ADD ./packages/database/package.json ./packages/database/package.json
ADD ./packages/integrations/package.json ./packages/integrations/package.json
ADD ./packages/zero/package.json ./packages/zero/package.json
ADD ./packages/editor/package.json ./packages/editor/package.json
RUN bun install --ignore-scripts

ADD ./packages/backend ./packages/backend
ADD ./packages/core ./packages/core
ADD ./packages/database ./packages/database
ADD ./packages/integrations ./packages/integrations
ADD ./packages/zero ./packages/zero
ADD ./packages/editor ./packages/editor

WORKDIR ./packages/backend

CMD ["bun", "run", "./src/index.ts"]
