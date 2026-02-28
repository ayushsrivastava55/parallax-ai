# ── Stage 1: Build frontend ──────────────────────────────────────
FROM node:23-slim AS frontend-build

RUN npm install -g bun

WORKDIR /build/frontend
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install

COPY frontend/ .
RUN bun run build

# ── Stage 2: Build flash-agent ──────────────────────────────────
FROM node:23-slim AS agent-build

RUN npm install -g bun

WORKDIR /build/flash-agent
COPY flash-agent/package.json flash-agent/bun.lock* ./
RUN bun install

COPY flash-agent/ .

# ── Stage 3: Production runtime ────────────────────────────────
FROM node:23-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN npm install -g bun tsx

WORKDIR /app

# Copy flash-agent with node_modules
COPY --from=agent-build /build/flash-agent /app/flash-agent

# Copy built frontend dist + public skill files
COPY --from=frontend-build /build/frontend/dist /app/frontend/dist
COPY --from=frontend-build /build/frontend/public /app/frontend/public

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/v1/system/health || exit 1

WORKDIR /app/flash-agent

CMD ["npx", "tsx", "src/server.ts"]
