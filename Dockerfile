FROM node:20-slim

# better-sqlite3/sharp는 대부분 사전 빌드된 바이너리를 받아오지만, 혹시 이 플랫폼용이
# 없을 경우를 대비해 빌드 도구를 함께 넣어둔다. claude(Claude Code CLI)도 여기서 설치한다.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4173
CMD ["node", "dist/index.js"]
