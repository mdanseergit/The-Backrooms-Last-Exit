FROM node:24-slim

WORKDIR /workspace
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile

EXPOSE 5000 5173