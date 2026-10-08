# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY tests ./tests
RUN npm run build

# Stage 2: Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/tsconfig.json ./tsconfig.json
COPY --chown=node:node --from=builder /app/vitest.config.ts ./vitest.config.ts
COPY --chown=node:node --from=builder /app/src ./src
COPY --chown=node:node --from=builder /app/tests ./tests

RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]