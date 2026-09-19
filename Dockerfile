FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.4.2
WORKDIR /app
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile && pnpm build && mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production
EXPOSE 4310
CMD ["pnpm", "start"]
