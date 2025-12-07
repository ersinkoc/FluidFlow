# Multi-stage build for production-optimized Docker image
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production image, copy all the files and run the app
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./package.json
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Create projects directory with proper permissions
RUN mkdir -p /app/projects && chown nextjs:nodejs /app/projects

USER nextjs

# Expose the port the app runs on
EXPOSE 3200

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3200/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Run the application
CMD ["npm", "run", "server"]