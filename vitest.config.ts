import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Vitest 单元测试配置
 * ====================
 * - 测试目录：src/tests/unit
 * - 环境：jsdom（模拟浏览器）
 * - 覆盖率：v8 provider
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    dir: "./src/tests/unit", // 单元测试目录
    globals: true, // 全局 describe/it/expect
    environment: "jsdom", // 浏览器环境模拟
    setupFiles: "./src/tests/unit/setup.ts", // 测试前置
    css: true, // 支持 CSS
    reporters: ["verbose"], // 详细输出
    include: ["**/*.test.{ts,tsx}"], // 测试文件匹配
    testTimeout: 15000, // 单测试超时 15s
    hookTimeout: 10000, // Hook 超时 10s
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*"],
      exclude: ["src/tests/**/*", "src/**/*.d.ts", "src/stories/**/*"],
    },
  },
});
