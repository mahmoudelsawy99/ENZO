FROM node:22-bookworm-slim AS api-build
WORKDIR /src
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/assets ./assets
RUN npm run build

FROM node:22-bookworm-slim AS web-build
WORKDIR /src
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npx ng build --configuration=production

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx gettext-base \
  && rm -rf /var/lib/apt/lists/* \
  && rm -f /etc/nginx/sites-enabled/default
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=api-build /src/dist ./dist
COPY --from=api-build /src/assets ./assets
COPY --from=web-build /src/dist/client/browser /usr/share/nginx/html
COPY deploy/nginx.conf.template /opt/enzo/nginx.conf.template
COPY deploy/start.sh /opt/enzo/start.sh
RUN chmod +x /opt/enzo/start.sh
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
LABEL org.opencontainers.image.source="https://github.com/mahmoudelsawy99/ENZO"
LABEL org.opencontainers.image.description="ENZO site and API"
CMD ["/opt/enzo/start.sh"]
