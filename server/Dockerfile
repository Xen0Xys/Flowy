FROM oven/bun:1.4.2-alpine AS base
WORKDIR /usr/src/app
RUN apk add --no-cache openssl

FROM base AS deps
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
COPY package.json ./
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN printf '[install]\nminimumReleaseAge = 86400\nexact = true\n' > bunfig.toml
RUN bun install
RUN bunx prisma generate

FROM base AS builder
ENV NODE_ENV=production
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/prisma ./prisma
COPY package.json ./
COPY tsconfig.json ./
COPY build.ts ./
COPY src ./src
COPY bun-plugins/swagger.ts ./bun-plugins/swagger.ts
RUN bun run build

FROM base AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
COPY package.json ./
COPY prisma.config.ts ./
COPY --from=deps /usr/src/app/prisma ./prisma
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
USER bun

EXPOSE 4000
CMD bunx prisma migrate deploy && bunx prisma db seed && bun run start:prod
