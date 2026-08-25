# stepaway devcontainer image builder.
#
# Runs as the main container of the k8s Job the server creates on an env-image
# cache miss (SPEC-v0.3). It talks to a dind sidecar over
# DOCKER_HOST=tcp://127.0.0.1:2375, builds the devcontainer described by the
# tarball mounted at $ENVSPEC_PATH (under /spec), and pushes the result to the
# in-cluster registry.
#
# node:22-bookworm-slim ships GNU tar >= 1.29; entrypoint.sh relies on its
# default refusal of ".." and absolute member paths. Re-check on any base bump.
FROM node:22-bookworm-slim

# docker CLI only (no daemon: that is the dind sidecar's job) + the bits the
# devcontainer CLI shells out to.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg git jq; \
    install -m 0755 -d /etc/apt/keyrings; \
    curl -fsSL https://download.docker.com/linux/debian/gpg \
      -o /etc/apt/keyrings/docker.asc; \
    chmod a+r /etc/apt/keyrings/docker.asc; \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
      > /etc/apt/sources.list.d/docker.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin; \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g --no-audit --no-fund @devcontainers/cli@0.80.0

COPY entrypoint.sh /usr/local/bin/stepaway-build
RUN chmod +x /usr/local/bin/stepaway-build

ENV DOCKER_HOST=tcp://127.0.0.1:2375 \
    STEPAWAY_FEATURE=ghcr.io/augustinbegue/stepaway-feature/stepaway:0

WORKDIR /spec
ENTRYPOINT ["/usr/local/bin/stepaway-build"]
