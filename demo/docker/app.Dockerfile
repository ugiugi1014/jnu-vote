# 데모용 서버·배포기 이미지 (Node 22 + Foundry)
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates git \
 && rm -rf /var/lib/apt/lists/*
# Foundry (forge·cast·anvil): 컨트랙트 배포용
RUN curl -sSL https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_amd64.tar.gz \
  | tar -xz -C /usr/local/bin

WORKDIR /repo
COPY blockchain/package.json blockchain/package-lock.json blockchain/
RUN cd blockchain && npm ci --no-audit --no-fund
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund

COPY blockchain/contracts blockchain/contracts
COPY server server
COPY demo demo
# 컨트랙트는 이미지 만들 때 미리 컴파일해 둔다 (실행 시 배포만)
RUN cd demo/foundry && forge build
