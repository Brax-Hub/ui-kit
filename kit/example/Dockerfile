# A Brax Business App as a hub module: one Node 22 container with tinbase inside, non-root, read-only filesystem, data
# on the module's own volume at /data (brax-hub-module step 7).
#
# The runtime is Debian (bookworm-slim), not Alpine: tinbase's native engine runs the theseus-rs postgresql-binaries,
# which are glibc builds (x86_64-unknown-linux-gnu / aarch64-unknown-linux-gnu) and do not run on musl. The binaries
# are fetched once in the build stage into /opt/tinbase-pg, so a read-only container never downloads anything.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev
# ensurePostgres(version, cacheDir): the pinned Postgres 17 tarball, checksum-verified, unpacked into the cache dir.
RUN node -e "import('tinbase/node').then(m => m.ensurePostgres(undefined, '/opt/tinbase-pg', console.log))"

FROM node:22-bookworm-slim
# What the Postgres binaries link against at run time; the Node image carries the rest.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libssl3 zlib1g libxml2 libicu72 liblz4-1 libzstd1 libreadline8 libuuid1 libgssapi-krb5-2 \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 10001 app \
 && useradd --uid 10001 --gid app --home-dir /data --no-create-home --shell /usr/sbin/nologin app \
 && mkdir /data && chown app:app /data
WORKDIR /app
COPY --from=build --chown=app:app /opt/tinbase-pg /opt/tinbase-pg
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/server ./server
COPY --from=build --chown=app:app /app/supabase ./supabase
COPY --from=build --chown=app:app /app/package.json /app/module.yaml ./
ENV NODE_ENV=production \
    APP_ENV=hub \
    PORT=8080 \
    DATA_DIR=/data \
    TINBASE_ENGINE=native \
    TINBASE_PG_CACHE_DIR=/opt/tinbase-pg \
    LCC_URL=https://lcc-edge:8443 \
    MODULE_CREDENTIAL_DIR=/credential \
    LANG=C.UTF-8
USER app
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:8080' + (process.env.HEALTH_PATH || '/modules/example/healthz')).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
ENTRYPOINT ["node", "dist/server/index.js"]
