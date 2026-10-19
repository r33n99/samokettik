FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY apps apps
COPY packages packages
COPY config config
RUN npm run build

FROM build AS api
ENV NODE_ENV=production
USER node
EXPOSE 3001
CMD ["node", "apps/server/dist/entrypoints/api.js"]

FROM build AS migrate
USER node
CMD ["node", "apps/server/dist/db/migrate.js"]

FROM build AS seed
USER node
CMD ["node", "apps/server/dist/db/seed.js"]

FROM build AS worker
USER node
CMD ["node", "apps/server/dist/entrypoints/worker.js"]

FROM nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236 AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
