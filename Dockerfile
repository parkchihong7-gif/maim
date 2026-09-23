FROM node:20-slim

# better-sqlite3/sharp는 대부분 사전 빌드된 바이너리를 받아오지만, 혹시 이 플랫폼용이
# 없을 경우를 대비해 빌드 도구를 함께 넣어둔다.
#
# **AI 명령 도구 셋을 모두 넣는다.** 쓰시는 분이 [관리자 설정]에서 고르시는데,
# 고른 것만 들어 있으면 바꿀 때마다 서버를 다시 올려야 한다. 셋 다 들어 있어도
# 로그인한 것만 실제로 돌아가므로 해로울 것이 없다.
#
#   claude  Claude Pro/Max 구독
#   gemini  개인 구글 계정이면 하루 1,000건 무료
#   codex   ChatGPT Plus 구독
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g \
         @anthropic-ai/claude-code \
         @google/gemini-cli \
         @openai/codex

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4173
CMD ["node", "dist/index.js"]
