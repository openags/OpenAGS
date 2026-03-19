# OpenAGS — Python backend + Node.js UI server
# Usage:
#   docker build -t openags .
#   docker run -p 3001:3001 -v ~/.openags:/root/.openags openags

FROM node:20-slim AS frontend

WORKDIR /app/desktop
COPY desktop/package.json desktop/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY desktop/ .
RUN pnpm build


FROM python:3.12-slim

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl && \
    rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install --no-cache-dir uv

WORKDIR /app

# Python deps
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

# Copy source
COPY openags/ openags/
COPY skills/ skills/

# Copy built frontend
COPY --from=frontend /app/desktop/out/ desktop/out/
COPY --from=frontend /app/desktop/node_modules/ desktop/node_modules/
COPY --from=frontend /app/desktop/package.json desktop/
COPY desktop/src/main/ desktop/src/main/

# Ports: 3001 (Node.js UI), 19836 (Python API)
EXPOSE 3001 19836

# Start: Python backend + Node.js server
CMD uv run openags serve --port 19836 & \
    cd desktop && node out/main/index.js --serve
