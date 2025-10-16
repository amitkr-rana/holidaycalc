import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/pexels": {
        target: "https://api.pexels.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pexels/, ""),
      },
      "/api/flights": {
        target: "https://sunidhiyadav69.pythonanywhere.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/flights/, "/flight-result"),
      },
    },
  },
})
