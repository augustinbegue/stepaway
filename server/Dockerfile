# stepaway backend image — ghcr.io/augustinbegue/stepaway-server (SPEC-v0.2 §5).
# Build context is the REPO ROOT, because the server bundles @stepaway/core:
#   docker build -f server/Dockerfile -t stepaway-server .
FROM oven/bun:1.3-slim AS build
WORKDIR /repo

# deps first: the lockfile changes far less often than the sources
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY cli/package.json cli/
COPY server/package.json server/
RUN bun install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY server server
# one self-contained file: the runtime image needs no node_modules at all
RUN bun build server/src/server.ts --target=bun --outfile=/out/server.js

FROM oven/bun:1.3-slim AS runtime
WORKDIR /app
COPY --from=build /out/server.js ./server.js
ENV NODE_ENV=production \
    PORT=8080 \
    # the API server is signed by the cluster CA the ServiceAccount mounts
    NODE_EXTRA_CA_CERTS=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
EXPOSE 8080
USER bun
CMD ["bun", "run", "server.js"]
