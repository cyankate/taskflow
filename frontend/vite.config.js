import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const flaskPort = process.env.FLASK_PORT || process.env.VITE_API_PROXY_PORT || "5000";
const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ||
  `${process.env.VITE_API_PROXY_PROTOCOL || "http"}://${process.env.VITE_API_PROXY_HOST || "0.0.0.0"}:${flaskPort}`;

export default defineConfig({
  plugins: [vue()],
  server: {
    host: process.env.VITE_DEV_HOST || "0.0.0.0",
    port: Number(process.env.VITE_DEV_PORT || 5173),
    proxy: {
      "/api": {
        target: apiProxyTarget, 
        changeOrigin: true
      }
    }
  }
});
