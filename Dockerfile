# syntax=docker/dockerfile:1

# ---- build the dashboard ----
FROM node:22-bookworm-slim AS dashboard
WORKDIR /app/dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ ./
# The dashboard imports ../../shared/*.json at build time, so it must exist at /app/shared.
COPY shared/ /app/shared/
RUN npm run build

# ---- run the agent ----
FROM node:22-bookworm-slim AS run
# HOST stays on loopback: the only way in is the Tailscale container that shares this network.
ENV NODE_ENV=production \
    HOST=127.0.0.1 \
    PORT=8787 \
    DB_PATH=/app/agent/data/aide.db \
    OPUS_KEY_DIR=/keys
WORKDIR /app/agent
COPY agent/package.json agent/package-lock.json ./
# tsx is a devDependency and is how the agent runs. NODE_ENV=production makes npm skip
# devDependencies, so ask for them explicitly.
RUN npm ci --include=dev
COPY agent/ ./
COPY shared/ /app/shared/
COPY seed/ /app/seed/
COPY --from=dashboard /app/dashboard/dist /app/dashboard/dist
# data = database, files, backups. keys = the master key, kept on its own volume.
RUN mkdir -p /app/agent/data /keys && chown -R node:node /app/agent/data /keys
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/auth/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "src/cli.ts", "serve"]
