/**
 * Playwright globalSetup —— 在所有 spec 文件执行前运行一次。
 *
 * 清理上一次测试运行残留的 .cache/ 目录（含 photos.db 和 .thumbs/）。
 * database-listeners.ts 将 DB 路径设为 appRoot/.cache/photos.db，
 * 该文件跨 npm run test:e2e 调用持久化，会导致 beforeCount 非零、
 * 初始状态不确定。每次测试运行前清理确保干净起点。
 *
 * 注意：globalSetup 在 Node.js 上下文运行（非 Electron 进程），
 * 不能 import { app } from "electron"（app 为 undefined）。
 * macOS 的 userData 路径硬编码为标准位置，与 Electron app.getPath 一致。
 * Windows 下为 process.cwd()（仓库根目录，与既有行为一致）。
 */
import fs from "node:fs";
import path from "node:path";

export default async function globalSetup(): Promise<void> {
  // macOS 的 userData 路径：~/Library/Application Support/<productName>
  // productName 取自 package.json 的 "productName" 字段（含空格，Electron 会原样使用）
  // Windows 保持 process.cwd()，与 database-listeners.ts 的 appRoot 逻辑一致
  const appRoot =
    process.platform === "darwin"
      ? path.join(
          process.env.HOME || "",
          "Library",
          "Application Support",
          "Electron Media Toolbox",
        )
      : process.cwd();
  const cacheDir = path.resolve(appRoot, ".cache");
  fs.rmSync(cacheDir, { recursive: true, force: true });
}
