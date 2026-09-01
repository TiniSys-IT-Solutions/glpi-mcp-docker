# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
ARG APP_VERSION=0.2.7
ARG SUPERGATEWAY_VERSION=3.4.3
ARG MCP_SDK_VERSION=1.30.0
ARG ZOD_VERSION=3.25.76
ARG UPSTREAM_LEGACY_VERSION=v3.3.0

FROM node:${NODE_VERSION} AS build

ARG SUPERGATEWAY_VERSION
ARG MCP_SDK_VERSION

WORKDIR /build

COPY package.json package-lock.json tsconfig.json LICENSE NOTICE README.md ./
RUN npm ci

COPY src ./src
COPY test-public ./test-public
COPY scripts ./scripts

RUN npm test \
  && npm run build \
  && npm prune --omit=dev \
  && npm install --omit=dev --no-audit --no-fund \
    "supergateway@${SUPERGATEWAY_VERSION}" \
    "@modelcontextprotocol/sdk@${MCP_SDK_VERSION}"

FROM node:${NODE_VERSION} AS runtime

ARG SUPERGATEWAY_VERSION
ARG MCP_SDK_VERSION
ARG ZOD_VERSION
ARG UPSTREAM_LEGACY_VERSION
ARG APP_VERSION

LABEL org.opencontainers.image.title="glpi-mcp-docker" \
      org.opencontainers.image.description="Docker-first GLPI MCP server with Legacy, High-Level, and Hybrid API routing." \
      org.opencontainers.image.source="https://github.com/TiniSys-IT-Solutions/glpi-mcp-docker" \
      org.opencontainers.image.documentation="https://github.com/TiniSys-IT-Solutions/glpi-mcp-docker/blob/main/README.md" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="DooSys / TiniSys IT Solutions" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.upstream.source="https://github.com/GMS64260/mcp-glpi" \
      org.opencontainers.image.upstream.version="${UPSTREAM_LEGACY_VERSION}" \
      org.opencontainers.image.supergateway.version="${SUPERGATEWAY_VERSION}" \
      org.opencontainers.image.mcp-sdk.version="${MCP_SDK_VERSION}" \
      org.opencontainers.image.zod.version="${ZOD_VERSION}"

ENV NODE_ENV=production \
    APP_VERSION="${APP_VERSION}" \
    GLPI_API_MODE=legacy \
    GLPI_API_VERSION=2.3 \
    GLPI_AUTH_MODE=service_account \
    UPSTREAM_LEGACY_VERSION="${UPSTREAM_LEGACY_VERSION}" \
    SUPERGATEWAY_VERSION="${SUPERGATEWAY_VERSION}" \
    MCP_SDK_VERSION="${MCP_SDK_VERSION}" \
    ZOD_VERSION="${ZOD_VERSION}" \
    MCP_PORT=8000 \
    MCP_STABLE_PORT=8000 \
    MCP_STABLE_PATH=/mcp \
    MCP_STABLE_HEALTH_PATH=/healthz \
    MCP_PREVIEW_ENABLED=false \
    MCP_PREVIEW_PORT=8001 \
    MCP_PATH=/mcp \
    MCP_HEALTH_PATH=/healthz \
    MCP_SESSION_TIMEOUT_MS=600000 \
    MCP_LOG_LEVEL=info

WORKDIR /app

RUN mkdir -p /uploads && chown node:node /uploads

COPY --from=build /build/package.json /app/package.json
COPY --from=build /build/package-lock.json /app/package-lock.json
COPY --from=build /build/LICENSE /app/LICENSE
COPY --from=build /build/NOTICE /app/NOTICE
COPY --from=build /build/README.md /app/README.md
COPY --from=build /build/dist /app/dist
COPY --from=build /build/node_modules /app/node_modules

RUN chown -R node:node /app

USER node

EXPOSE 8000 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${MCP_STABLE_PORT}${MCP_STABLE_HEALTH_PATH}" | grep -q ok || exit 1

CMD ["node", "dist/launcher.js"]
