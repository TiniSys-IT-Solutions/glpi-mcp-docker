# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
ARG MCP_GLPI_VERSION=v3.3.0
ARG SUPERGATEWAY_VERSION=3.4.3
ARG MCP_SDK_VERSION=1.18.2

FROM node:${NODE_VERSION} AS build

ARG MCP_GLPI_VERSION
ARG SUPERGATEWAY_VERSION
ARG MCP_SDK_VERSION

WORKDIR /build

RUN apk add --no-cache git \
  && git clone --depth 1 --branch "${MCP_GLPI_VERSION}" https://github.com/GMS64260/mcp-glpi.git /build/mcp-glpi

WORKDIR /build/mcp-glpi

RUN npm ci \
  && npm test \
  && npm run build \
  && npm prune --omit=dev \
  && npm install --omit=dev --no-audit --no-fund \
    "supergateway@${SUPERGATEWAY_VERSION}" \
    "@modelcontextprotocol/sdk@${MCP_SDK_VERSION}"

FROM node:${NODE_VERSION} AS runtime

ARG MCP_GLPI_VERSION
ARG SUPERGATEWAY_VERSION
ARG MCP_SDK_VERSION

LABEL org.opencontainers.image.title="glpi-mcp-docker" \
      org.opencontainers.image.description="Docker wrapper exposing GMS64260/mcp-glpi over MCP Streamable HTTP without modifying upstream." \
      org.opencontainers.image.source="https://github.com/DooSys/glpi-mcp-docker" \
      org.opencontainers.image.upstream.source="https://github.com/GMS64260/mcp-glpi" \
      org.opencontainers.image.upstream.version="${MCP_GLPI_VERSION}" \
      org.opencontainers.image.supergateway.version="${SUPERGATEWAY_VERSION}" \
      org.opencontainers.image.mcp-sdk.version="${MCP_SDK_VERSION}"

ENV NODE_ENV=production \
    MCP_GLPI_VERSION="${MCP_GLPI_VERSION}" \
    SUPERGATEWAY_VERSION="${SUPERGATEWAY_VERSION}" \
    MCP_PORT=8000 \
    MCP_PATH=/mcp \
    MCP_HEALTH_PATH=/healthz \
    MCP_SESSION_TIMEOUT_MS=600000 \
    MCP_LOG_LEVEL=info

WORKDIR /app

COPY --from=build /build/mcp-glpi/package.json /app/package.json
COPY --from=build /build/mcp-glpi/package-lock.json /app/package-lock.json
COPY --from=build /build/mcp-glpi/dist /app/dist
COPY --from=build /build/mcp-glpi/node_modules /app/node_modules

RUN chown -R node:node /app

USER node

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${MCP_PORT}${MCP_HEALTH_PATH}" | grep -q ok || exit 1

CMD ["sh", "-c", "exec node node_modules/supergateway/dist/index.js --stdio \"node dist/index.js\" --outputTransport streamableHttp --stateful --sessionTimeout \"${MCP_SESSION_TIMEOUT_MS}\" --port \"${MCP_PORT}\" --streamableHttpPath \"${MCP_PATH}\" --healthEndpoint \"${MCP_HEALTH_PATH}\" --logLevel \"${MCP_LOG_LEVEL}\""]
