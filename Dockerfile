# OpenAGS — TypeScript monorepo server
# Usage:
#   docker build -t openags .
#   docker run -p 3001:3001 -v ~/.openags:/root/.openags openags

# ── Build Stage ────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY package.json pnpm-workspace.yaml turbo.json ./

# Copy package.json files for all packages
COPY packages/app/package.json packages/app/
COPY packages/desktop/package.json packages/desktop/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ packages/
COPY skills/ skills/

# Build all packages
RUN pnpm build

# ── Production Stage ───────────────────────────────────
FROM node:20-slim

# System deps for node-pty
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built artifacts
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/turbo.json ./
COPY --from=builder /app/packages/app/package.json packages/app/
COPY --from=builder /app/packages/app/dist packages/app/dist/
COPY --from=builder /app/packages/desktop/package.json packages/desktop/
COPY --from=builder /app/packages/desktop/out packages/desktop/out/

# Copy skills (language-agnostic)
COPY skills/ skills/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Expose port
EXPOSE 3001

# Default environment
ENV NODE_ENV=production
ENV PORT=3001

# Start server
CMD ["node", "packages/app/dist/index.js"]
