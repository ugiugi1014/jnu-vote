# 데모용 화면 이미지: 빌드 후 vite preview 로 제공
FROM node:22-bookworm-slim
WORKDIR /app
COPY front/user/package.json front/user/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY front/user ./
# 브라우저가 접속하는 주소 (데모 PC 기준)
ARG VITE_API_BASE_URL=http://localhost:8080/api
ARG VITE_RPC_URL=http://localhost:8545
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_RPC_URL=$VITE_RPC_URL
RUN npx vite build
EXPOSE 5173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
