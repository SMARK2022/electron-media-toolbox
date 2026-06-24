/**
 * Python 后端二进制路径解析单元测试
 * =================================
 * 验证 getBackendBinaryName 在不同平台下返回正确的二进制相对路径。
 *
 * macOS: Nuitka --mode=app 产物是 .app 目录，二进制在 Contents/MacOS/ 内。
 *   路径必须与 forge.config.ts extraResource 拷贝目标和 python-make.sh 输出一致。
 * Windows: Nuitka --mode=onefile 产物是单个 .exe 文件。
 * Linux: 无扩展名单文件。
 *
 * 行为级断言：mock process.platform 后验证返回值的路径结构，
 * 不检测函数内部实现细节。
 */
import path from "path";

// 保存原始 process.platform，测试后恢复，避免污染其他测试
const _originalPlatform = process.platform;

/**
 * 安全地 mock process.platform，因为它是只读属性需要 defineProperty 覆盖。
 * 每个测试通过调用此函数设置目标平台，afterEach 中恢复原始值。
 */
function mockPlatform(target: string): void {
  Object.defineProperty(process, "platform", {
    value: target,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  // 恢复原始平台值，防止跨用例状态泄漏
  mockPlatform(_originalPlatform);
  // 清除模块缓存，使下次 import 时 getBackendBinaryName 重新读取 process.platform
  vi.resetModules();
});

describe("getBackendBinaryName — macOS .app bundle 路径", () => {
  it("macOS 返回 .app/Contents/MacOS/ 内的二进制路径", async () => {
    // macOS Nuitka --mode=app 输出 web_api.app 目录（standalone + app bundle），
    // 实际二进制在 Contents/MacOS/web_api，此路径是 PyObjC Foundation 框架的硬性要求
    mockPlatform("darwin");
    const { getBackendBinaryName } = await import("@/lib/backend-path");
    const name = getBackendBinaryName();

    // 路径必须包含 .app bundle 结构的三层目录
    expect(name).toContain("web_api.app");
    expect(name).toContain("Contents");
    expect(name).toContain("MacOS");
    // 末尾必须是二进制文件名 web_api（无 .exe 扩展名）
    expect(name).toMatch(/web_api$/);
  });

  it("macOS 路径与 path.join 兼容（可拼接到任意基目录）", async () => {
    // main.ts 的 resolvePythonBackendConfig 用 path.join(base, binName) 拼接完整路径，
    // 返回值必须能被 path.join 正确处理，不产生重复分隔符或路径断裂
    mockPlatform("darwin");
    const { getBackendBinaryName } = await import("@/lib/backend-path");
    const name = getBackendBinaryName();
    const fullDevPath = path.join("/project", "python", "out", name);

    // 拼接后路径必须以 .app 目录的完整结构结尾
    expect(fullDevPath).toBe(
      path.join("/project/python/out/web_api.app/Contents/MacOS/web_api"),
    );
  });

  it("Windows 返回 .exe 文件名（无路径分隔符）", async () => {
    // Windows Nuitka --mode=onefile 输出单个 web_api.exe，无目录结构
    mockPlatform("win32");
    const { getBackendBinaryName } = await import("@/lib/backend-path");
    const name = getBackendBinaryName();

    expect(name).toBe("web_api.exe");
    // Windows 产物是单文件，路径中不应有目录分隔符
    expect(name).not.toContain("/");
    expect(name).not.toContain("\\");
  });

  it("Linux 返回无扩展名单文件名", async () => {
    // Linux 无 PyObjC 依赖，仍用 onefile 模式，输出 web_api 单文件
    mockPlatform("linux");
    const { getBackendBinaryName } = await import("@/lib/backend-path");
    const name = getBackendBinaryName();

    expect(name).toBe("web_api");
    expect(name).not.toContain("/");
  });
});
