FROM oven/bun:1.3.6-alpine AS base
WORKDIR /usr/src/app
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json ./
RUN bun install

FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM base AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
USER bun
EXPOSE 3000
COPY --chown=bun:bun --from=builder /usr/src/app/.output ./.output
CMD ["bun", ".output/server/index.mjs"]
