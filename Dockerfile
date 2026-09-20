FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
RUN addgroup -S suraksha && adduser -S suraksha -G suraksha
COPY --from=build --chown=suraksha:suraksha /app/package.json /app/package-lock.json ./
COPY --from=build --chown=suraksha:suraksha /app/node_modules ./node_modules
COPY --from=build --chown=suraksha:suraksha /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=suraksha:suraksha /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=suraksha:suraksha /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=suraksha:suraksha /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=suraksha:suraksha /app/packages/contracts/dist ./packages/contracts/dist
RUN mkdir -p /app/data && chown suraksha:suraksha /app/data
USER suraksha
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]
