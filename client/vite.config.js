import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8443',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:8443',
        changeOrigin: true, 
        ws: true, 
      },
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@components": '/src/components',
      "@slices": '/src/slices',
      "@hooks": '/src/hooks',
      "@utils": '/src/utils',
    },
  },
})
