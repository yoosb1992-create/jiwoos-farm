FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY multiplayer-farm/package.json multiplayer-farm/package-lock.json ./
RUN npm ci
COPY multiplayer-farm/tsconfig.json multiplayer-farm/tsconfig.server.json ./
COPY multiplayer-farm/server ./server
COPY multiplayer-farm/shared ./shared
COPY multiplayer-farm/persistence ./persistence
RUN npm run build:server && npm prune --omit=dev
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=2567 LAB_LATENCY_MS=0
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||2567)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--enable-source-maps","dist/server/index.js"]
