/**
 * clearPhotos 原子性与 faceData 完整性单元测试
 * ============================================
 * 验证 clearPhotos 的两个核心不变量：
 * 1. 原子性：move + delete 必须在单次 exec 事务中执行（BEGIN IMMEDIATE ... COMMIT），
 *    防止轮询读到"已移动但未删除"的中间状态，或 DELETE 失败后 INSERT 产生重复行。
 * 2. faceData 列完整：present → previous 的列拷贝必须包含 faceData，
 *    避免人脸检测数据在归档时丢失。
 *
 * 若 clearPhotos 改回两次独立 run 调用，或遗漏 faceData 列，
 * 对应断言将失败，从而防止回归。
 */
import { vi } from "vitest";

// Mock window.ElectronDB——jsdom 环境下不存在真实 IPC
// 仅捕获 exec 调用的 SQL 字符串，不关心返回值
const mockExec = vi.fn().mockResolvedValue(undefined);
const mockRun = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  mockExec.mockClear();
  mockRun.mockClear();
  (globalThis as unknown as { ElectronDB: unknown }).ElectronDB = {
    exec: mockExec,
    run: mockRun,
    get: vi.fn(),
    all: vi.fn(),
    getDbPath: vi.fn(),
  };
});

import { clearPhotos } from "@/helpers/ipc/database/db";

describe("clearPhotos 原子性", () => {
  test("使用 exec 而非两次独立 run，确保 move+delete 在同一事务", async () => {
    await clearPhotos();

    // 不变量：clearPhotos 必须通过 exec 发送单条多语句 SQL（BEGIN ... COMMIT），
    // 而非两次独立的 run 调用——后者在 IPC 层面非原子，
    // 轮询定时器可能在两条 run 之间读到空的 present 表
    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(mockRun).not.toHaveBeenCalled();
  });

  test("SQL 包含 BEGIN IMMEDIATE 和 COMMIT，构成完整事务", async () => {
    await clearPhotos();

    const sql = mockExec.mock.calls[0][0] as string;
    // BEGIN IMMEDIATE 立即获取写锁，避免 BEGIN（deferred）可能的死锁
    expect(sql).toContain("BEGIN IMMEDIATE");
    expect(sql).toContain("COMMIT");
  });

  test("SQL 包含 INSERT INTO previous 和 DELETE FROM present", async () => {
    await clearPhotos();

    const sql = mockExec.mock.calls[0][0] as string;
    expect(sql).toContain("INSERT INTO previous");
    expect(sql).toContain("DELETE FROM present");
  });
});

describe("clearPhotos faceData 列完整性", () => {
  test("归档 SQL 包含 faceData 列，防止人脸数据丢失", async () => {
    await clearPhotos();

    const sql = mockExec.mock.calls[0][0] as string;
    // 不变量：present 表有 faceData 列（database-listeners.ts 初始化时添加），
    // previous 表同样有该列。clearPhotos 归档时必须拷贝 faceData，
    // 否则历史备份丢失人脸检测结果，用户恢复 previous 时无法看到眨眼统计
    expect(sql).toContain("faceData");
  });
});

describe("clearPhotos 返回 Promise", () => {
  test("返回 Promise 以便调用方 await，避免 fire-and-forget 导致错误丢失", async () => {
    const result = clearPhotos();

    // 不变量：clearPhotos 必须返回 Promise，让 submitImportTask 能 await 并处理失败。
    // 旧实现返回 void（两次 run 的 Promise 被丢弃），clearPhotos 失败时调用方无感知
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});
