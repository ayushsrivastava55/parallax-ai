# ── Stage 1: Build frontend ──────────────────────────────────────
FROM node:23-slim AS frontend-build

RUN npm install -g bun

WORKDIR /build/frontend
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install

COPY frontend/ .
RUN bun run build

# ── Stage 2: Build server ──────────────────────────────────
FROM node:23-slim AS agent-build

RUN npm install -g bun

WORKDIR /build/server
COPY server/package.json server/bun.lock* ./
RUN bun install

COPY server/ .

# ── Stage 3: Production runtime ────────────────────────────────
FROM node:23-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN npm install -g bun tsx

WORKDIR /app

# Copy server with node_modules
COPY --from=agent-build /build/server /app/server

# Copy built frontend dist + public skill files
COPY --from=frontend-build /build/frontend/dist /app/frontend/dist
COPY --from=frontend-build /build/frontend/public /app/frontend/public

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/v1/system/health || exit 1

WORKDIR /app/server

CMD ["npx", "tsx", "src/server.ts"]
