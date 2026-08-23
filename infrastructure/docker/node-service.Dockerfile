FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
RUN npm install

FROM dependencies AS build
ARG APP
WORKDIR /app
RUN npm run build -w packages/events-sdk
RUN npm run build -w packages/logger-sdk
RUN npm run build -w packages/broker-sdk
RUN npm run build -w packages/outbox-sdk
RUN npm run build -w apps/${APP}

FROM node:22-alpine AS runtime
ARG APP
ENV APP=${APP}
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/${APP}/dist ./apps/${APP}/dist
COPY --from=build /app/apps/${APP}/package.json ./apps/${APP}/package.json
COPY --from=build /app/packages ./packages
CMD ["sh", "-c", "node apps/${APP}/dist/main.js"]
