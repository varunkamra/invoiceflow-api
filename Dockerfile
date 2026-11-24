# syntax=docker/dockerfile:1

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src/db ./prisma-tmp/
RUN npx prisma generate --schema prisma-tmp/schema.prisma

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# ---- runtime stage ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# run as non-root
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app && chown -R app:app /app
USER app
ENV NPM_CONFIG_CACHE=/tmp/.npm

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY src/db/schema.prisma src/db/migrations ./src/db/

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1

# run migrations before serving, then start
CMD ["sh", "-c", "npx prisma migrate deploy --schema src/db/schema.prisma && node dist/server.js"]
