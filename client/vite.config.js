import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@components": '/src/components',
      "@slices": '/src/slices',
    },
  },
})
