# Build: the client with Vite, the server bundled into one file, so the runtime image needs no node_modules.
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build && bun build server/src/index.ts --target bun --outfile server.js

FROM oven/bun:1.4-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/db.sqlite CLIENT_DIR=/app/dist
# The database, plus the -wal/-shm files SQLite puts next to it: mount a directory, not a file.
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s \
  CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "server.js"]
