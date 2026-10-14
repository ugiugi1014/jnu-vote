import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills(),
  ],
  // 증명 생성 워커(src/workers/voteProofWorker.js)도 snarkjs 를 쓰므로 같은 polyfill 적용
  worker: {
    format: 'es',
    plugins: () => [nodePolyfills()],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});