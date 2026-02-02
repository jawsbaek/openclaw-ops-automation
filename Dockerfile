# Multi-stage build for OpenClaw Ops Automation

# Stage 1: Base
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache bash curl && \
    corepack enable && \
    corepack prepare pnpm@latest --activate

# Stage 2: Dependencies
FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Stage 3: Development dependencies
FROM base AS dev-dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 4: Build (for future TypeScript support)
FROM dev-dependencies AS build
COPY . .
# Add build steps here if needed in the future

# Stage 5: Production
FROM base AS production

# Create non-root user
RUN addgroup -g 1001 openclaw && \
    adduser -D -u 1001 -G openclaw openclaw

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application code
COPY --chown=openclaw:openclaw . .

# Create necessary directories
RUN mkdir -p logs metrics analysis incidents reports && \
    chown -R openclaw:openclaw logs metrics analysis incidents reports

# Switch to non-root user
USER openclaw

# Expose any necessary ports (if needed in the future)
# EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Default command: Run orchestrator
CMD ["node", "ops-automation/agents/orchestrator.js", "continuous"]

# Labels
LABEL org.opencontainers.image.title="OpenClaw Ops Automation"
LABEL org.opencontainers.image.description="AI-powered operations monitoring and automation"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="OpenClaw Community"
