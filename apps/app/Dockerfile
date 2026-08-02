FROM node:22.14.0-alpine AS build

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/app/package.json apps/app/package.json
RUN npm ci

COPY apps/app apps/app
ARG VITE_PLATFORM_API_ENABLED=true
ARG VITE_PLATFORM_API_URL=/api
ARG VITE_APP_ENV=DEV
ENV VITE_PLATFORM_API_ENABLED=${VITE_PLATFORM_API_ENABLED}
ENV VITE_PLATFORM_API_URL=${VITE_PLATFORM_API_URL}
ENV VITE_APP_ENV=${VITE_APP_ENV}
RUN npm run build --workspace @miszczuk-it/app

FROM nginx:1.27.4-alpine

COPY apps/app/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /workspace/apps/app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
