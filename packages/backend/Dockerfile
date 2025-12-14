FROM mirror.gcr.io/oven/bun:1.3.4

ADD ./package.json .
ADD ./bun.lock .
ADD ./packages/core/package.json ./packages/core/package.json
ADD ./packages/backend/package.json ./packages/backend/package.json
ADD ./packages/database/package.json ./packages/database/package.json
ADD ./packages/zero/package.json ./packages/zero/package.json
RUN bun install --ignore-scripts

ADD ./packages/backend ./packages/backend
ADD ./packages/core ./packages/core
ADD ./packages/database ./packages/database
ADD ./packages/zero ./packages/zero

WORKDIR ./packages/backend

CMD ["bun", "run", "./src/index.ts"]
