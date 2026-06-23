/**
 * Playwright globalSetup —— 在所有 spec 文件执行前运行一次。
 *
 * 清理上一次测试运行残留的 .cache/ 目录（含 photos.db 和 .thumbs/）。
 * database-listeners.ts 将 DB 路径设为 process.cwd()/.cache/photos.db，
 * 该文件跨 npm run test:e2e 调用持久化，会导致 beforeCount 非零、
 * 初始状态不确定。每次测试运行前清理确保干净起点。
 */
import fs from "node:fs";
import path from "node:path";

export default async function globalSetup(): Promise<void> {
  // process.cwd() 在 E2E 运行时为仓库根目录，与 database-listeners.ts 一致
  const cacheDir = path.resolve(process.cwd(), ".cache");
  fs.rmSync(cacheDir, { recursive: true, force: true });
}
