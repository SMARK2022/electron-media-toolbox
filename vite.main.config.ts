import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  },
  optimizeDeps: {
    exclude: ['exif-parser'] // 确保不优化此模块
  }
});
