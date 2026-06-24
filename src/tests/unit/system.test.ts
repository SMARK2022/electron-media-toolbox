/**
 * 文件操作跨平台逻辑单元测试
 * =============================
 * changeFileExtension：锁定正则行为 /\.[^/.]+$/，被 copyPhotos 用于 RAW 文件路径生成。
 * createFolder / copyFile / folderExists：验证通过 IPC 委托主进程 fs API，
 * 不再走 runCommand（Windows cmd 命令），确保 macOS/Linux 下导出功能可用。
 *
 * 行为复现级断言：mock window.ElectronAPI 上的 IPC 方法，
 * 验证 createFolder/copyFile/folderExists 调用了正确的 IPC 通道、
 * 传入了正确的路径参数（不包含反斜杠转换），并在失败时不会抛出。
 */
import {
  changeFileExtension,
  createFolder,
  copyFile,
  folderExists,
} from "@/lib/system";

// Mock window.ElectronAPI —— jsdom 环境下 window 全局可用
// 每个 test 前重置 mock，避免跨用例状态泄漏
// 类型断言经 unknown 中转，兼容 ElectronAPI 接口与 vitest Mock 的结构差异
type MockedElectronAPI = {
  createFolder: ReturnType<typeof vi.fn>;
  copyFile: ReturnType<typeof vi.fn>;
  folderExists: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  (global as unknown as { ElectronAPI?: MockedElectronAPI }).ElectronAPI = {
    createFolder: vi.fn().mockResolvedValue({ success: true }),
    copyFile: vi.fn().mockResolvedValue({ success: true }),
    folderExists: vi.fn().mockResolvedValue(true),
  };
});

afterEach(() => {
  delete (global as unknown as { ElectronAPI?: MockedElectronAPI }).ElectronAPI;
});

describe("changeFileExtension", () => {
  test("正常替换单扩展名", () => {
    expect(changeFileExtension("photo.jpg", ".png")).toBe("photo.png");
  });

  test("仅替换最后一个扩展名（多 dot 文件名）", () => {
    // 正则用 $ 锚定末尾，只匹配最后的 .c
    expect(changeFileExtension("archive.tar.gz", ".zip")).toBe(
      "archive.tar.zip",
    );
  });

  test("无扩展名时原样返回（正则不匹配）", () => {
    // "README" 无 dot，正则不匹配，replace 返回原字符串
    // 注意：不会自动追加扩展名
    expect(changeFileExtension("README", ".md")).toBe("README");
  });

  test("尾部 dot 无字符时不匹配（[^/.]+ 需至少 1 字符）", () => {
    // "file." 的 dot 后无字符，正则不匹配
    expect(changeFileExtension("file.", ".jpg")).toBe("file.");
  });

  test("带路径的文件名正确替换末尾扩展名", () => {
    expect(changeFileExtension("C:/photos/IMG_001.JPG", ".NEF")).toBe(
      "C:/photos/IMG_001.NEF",
    );
  });

  test("替换为空字符串相当于删除扩展名", () => {
    expect(changeFileExtension("photo.jpg", "")).toBe("photo");
  });
});

describe("createFolder", () => {
  test("调用 createFolder IPC，传入原始路径（不转换斜杠）", async () => {
    const mockFn = window.ElectronAPI.createFolder as ReturnType<typeof vi.fn>;
    // macOS 路径含正斜杠，不应被转换为反斜杠
    await createFolder("/Users/test/export");
    expect(mockFn).toHaveBeenCalledWith("/Users/test/export");
  });

  test("Windows 路径保持原样传入（跨平台兼容）", async () => {
    const mockFn = window.ElectronAPI.createFolder as ReturnType<typeof vi.fn>;
    await createFolder("D:/photos/output");
    expect(mockFn).toHaveBeenCalledWith("D:/photos/output");
  });

  test("IPC 返回失败时不抛出（静默降级，与既有 catch 行为一致）", async () => {
    (
      window as unknown as { ElectronAPI: MockedElectronAPI }
    ).ElectronAPI.createFolder.mockResolvedValue({ success: false });
    // 不应 throw —— 旧实现也用 try/catch 吞掉错误
    await expect(createFolder("/some/path")).resolves.not.toThrow();
  });

  test("IPC 抛出异常时不向上传播（catch 吞掉，保持既有不变量）", async () => {
    (
      window as unknown as { ElectronAPI: MockedElectronAPI }
    ).ElectronAPI.createFolder.mockRejectedValue(new Error("EACCES"));
    await expect(createFolder("/root/forbidden")).resolves.not.toThrow();
  });
});

describe("copyFile", () => {
  test("调用 copyFile IPC，传入 src 和 dest 原始路径", async () => {
    const mockFn = window.ElectronAPI.copyFile as ReturnType<typeof vi.fn>;
    await copyFile("/Users/test/src.jpg", "/Users/test/dest.jpg");
    expect(mockFn).toHaveBeenCalledWith(
      "/Users/test/src.jpg",
      "/Users/test/dest.jpg",
    );
  });

  test("路径含 CJK 字符时原样传递（不截断不转码）", async () => {
    const mockFn = window.ElectronAPI.copyFile as ReturnType<typeof vi.fn>;
    // 中文路径在 Windows 和 macOS 均可能出现，IPC 序列化必须透明
    await copyFile("/Users/test/照片.jpg", "/Users/test/导出/照片.jpg");
    expect(mockFn).toHaveBeenCalledWith(
      "/Users/test/照片.jpg",
      "/Users/test/导出/照片.jpg",
    );
  });

  test("IPC 失败时不抛出（与既有 catch 行为一致）", async () => {
    (
      window as unknown as { ElectronAPI: MockedElectronAPI }
    ).ElectronAPI.copyFile.mockResolvedValue({ success: false });
    await expect(copyFile("/missing/src", "/dest")).resolves.not.toThrow();
  });
});

describe("folderExists", () => {
  test("IPC 返回 true 时返回 true", async () => {
    (
      window as unknown as { ElectronAPI: MockedElectronAPI }
    ).ElectronAPI.folderExists.mockResolvedValue(true);
    expect(await folderExists("/Users/test/existing")).toBe(true);
  });

  test("IPC 返回 false 时返回 false", async () => {
    (
      window as unknown as { ElectronAPI: MockedElectronAPI }
    ).ElectronAPI.folderExists.mockResolvedValue(false);
    expect(await folderExists("/nonexistent/path")).toBe(false);
  });

  test("IPC 抛出异常时返回 false（降级为不存在，不崩溃）", async () => {
    (
      window as unknown as { ElectronAPI: MockedElectronAPI }
    ).ElectronAPI.folderExists.mockRejectedValue(new Error("EPERM"));
    // 安全边界：异常时返回 false 而非 throw，避免阻塞 UI 输入校验流程
    expect(await folderExists("/restricted")).toBe(false);
  });

  test("路径含撇号时正常委托 IPC（macOS 文件夹名常含撇号，不应误报）", async () => {
    const mockFn = window.ElectronAPI.folderExists as ReturnType<typeof vi.fn>;
    mockFn.mockResolvedValue(true);
    // macOS 常见路径如 /Users/john/John's Photos 不应被引号校验拦截
    expect(await folderExists("/Users/john/John's Photos")).toBe(true);
    expect(mockFn).toHaveBeenCalledWith("/Users/john/John's Photos");
  });
});
