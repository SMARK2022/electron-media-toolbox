import { defineConfig } from "@playwright/test";

/**
 * Electron E2E 测试配置
 * ======================
 * 配置 Playwright 与 Electron 集成测试
 * - 使用 electron-playwright-helpers 启动打包后的应用
 * - 测试图片目录：dev/imgs_to test (23 张 JPG)
 * - 测试超时：90s（适应大量图片处理）
 */
export default defineConfig({
  testDir: "./src/tests/e2e", // E2E 测试目录
  fullyParallel: false, // Electron 测试需串行执行
  forbidOnly: !!process.env.CI, // CI 环境禁止 .only
  retries: process.env.CI ? 2 : 1, // CI 重试 2 次，本地重试 1 次
  workers: 1, // 单进程执行（Electron 限制）
  reporter: [["html"], ["list"]], // HTML + 控制台报告
  timeout: 60000, // 单测试超时 60s
  expect: { timeout: 15000 }, // 断言超时 15s
  use: {
    trace: "on-first-retry", // 首次重试时录制 trace
    screenshot: "only-on-failure", // 失败时截图
    video: "retain-on-failure", // 失败时保留视频
  },
  projects: [{ name: "electron", testMatch: /.*\.spec\.ts$/ }], // 仅匹配 .spec.ts
});
