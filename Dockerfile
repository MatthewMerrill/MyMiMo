# mymimo: one container, the API also serves the built web app.
# Node 26+ is required (built-in node:sqlite, and runs the TypeScript API directly).

# ---- build the web app
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
COPY web web
RUN npm run build -w web

# ---- runtime: API source, its production deps, and the built web app
FROM node:26-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/mymimo.db \
    WEB_DIST=/app/web/dist
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --omit=dev -w api && npm cache clean --force
COPY api api
COPY --from=build /app/web/dist web/dist

# Starts as root only to hand /data to the "node" user (a bind-mounted ./data is
# usually created root-owned), then drops to "node" to run the app.
RUN mkdir -p /data && chown node:node /data && printf '%s\n' \
    '#!/bin/sh' 'set -e' \
    'if [ "$(id -u)" = 0 ]; then' \
    '  chown node:node /data /data/mymimo.db* 2>/dev/null || true' \
    '  exec setpriv --reuid=node --regid=node --init-groups "$@"' \
    'fi' \
    'exec "$@"' > /entrypoint.sh && chmod +x /entrypoint.sh
VOLUME /data
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/auth/me').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "api/index.ts"]
