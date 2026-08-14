# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
ARG SUPERGATEWAY_VERSION=3.4.3
ARG MCP_SDK_VERSION=1.18.2
ARG UPSTREAM_LEGACY_VERSION=v3.3.0

FROM node:${NODE_VERSION} AS build

ARG SUPERGATEWAY_VERSION
ARG MCP_SDK_VERSION

WORKDIR /build

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY test ./test
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
ARG UPSTREAM_LEGACY_VERSION

LABEL org.opencontainers.image.title="glpi-mcp-docker" \
      org.opencontainers.image.description="Docker-first GLPI MCP server with Legacy, High-Level, and Hybrid API routing." \
      org.opencontainers.image.source="https://github.com/DooSys/glpi-mcp-docker" \
      org.opencontainers.image.upstream.source="https://github.com/GMS64260/mcp-glpi" \
      org.opencontainers.image.upstream.version="${UPSTREAM_LEGACY_VERSION}" \
      org.opencontainers.image.supergateway.version="${SUPERGATEWAY_VERSION}" \
      org.opencontainers.image.mcp-sdk.version="${MCP_SDK_VERSION}"

ENV NODE_ENV=production \
    GLPI_API_MODE=legacy \
    GLPI_API_VERSION=2.3 \
    GLPI_AUTH_MODE=service_account \
    UPSTREAM_LEGACY_VERSION="${UPSTREAM_LEGACY_VERSION}" \
    SUPERGATEWAY_VERSION="${SUPERGATEWAY_VERSION}" \
    MCP_PORT=8000 \
    MCP_PATH=/mcp \
    MCP_HEALTH_PATH=/healthz \
    MCP_SESSION_TIMEOUT_MS=600000 \
    MCP_LOG_LEVEL=info

WORKDIR /app

COPY --from=build /build/package.json /app/package.json
COPY --from=build /build/package-lock.json /app/package-lock.json
COPY --from=build /build/dist /app/dist
COPY --from=build /build/node_modules /app/node_modules

RUN chown -R node:node /app

USER node

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${MCP_PORT}${MCP_HEALTH_PATH}" | grep -q ok || exit 1

CMD ["sh", "-c", "exec node node_modules/supergateway/dist/index.js --stdio \"node dist/index.js\" --outputTransport streamableHttp --stateful --sessionTimeout \"${MCP_SESSION_TIMEOUT_MS}\" --port \"${MCP_PORT}\" --streamableHttpPath \"${MCP_PATH}\" --healthEndpoint \"${MCP_HEALTH_PATH}\" --logLevel \"${MCP_LOG_LEVEL}\""]
