import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 개발 시 클라(5173) → 서버(5174) 프록시. 상대 URL(/api, /ws)로 통신.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:5174", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:5174", ws: true },
    },
  },
});
