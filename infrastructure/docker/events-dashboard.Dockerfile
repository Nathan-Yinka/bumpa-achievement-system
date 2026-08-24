FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY tsconfig.json tsconfig.base.json tsconfig.spec.json ./
COPY scripts ./scripts
RUN npm install
CMD ["npx", "ts-node", "--transpile-only", "scripts/events-dashboard.ts"]
