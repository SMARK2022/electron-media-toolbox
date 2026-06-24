/**
 * Python 后端二进制路径解析
 * ========================
 * 根据当前平台返回 Nuitka 编译产物的相对路径名。
 *
 * 此路径必须与以下三处保持一致（修改时需同步检查）：
 * 1. scripts/python-make.sh / python-make.bat — Nuitka --output-filename 和 --mode
 * 2. forge.config.ts — extraResource 拷贝源路径
 * 3. src/main.ts resolvePythonBackendConfig() — 运行时定位二进制
 *
 * 不变量：
 * - macOS: --mode=app 输出 .app 目录（standalone + app bundle），
 *   PyObjC Foundation 框架要求 app bundle 结构，二进制在 Contents/MacOS/ 内
 * - Windows: --mode=onefile 输出单个 .exe 文件，无目录结构
 * - Linux: 无扩展名单文件
 */

/**
 * 返回 Python 后端二进制相对于 "python/out" 目录的相对路径。
 *
 * macOS 返回值含正斜杠路径分隔符，path.join 在 macOS/Linux 上能正确处理。
 * Windows 返回值无路径分隔符（单文件），path.join 在 Windows 上用反斜杠拼接。
 *
 * @returns 平台相关的二进制相对路径
 */
export function getBackendBinaryName(): string {
  if (process.platform === "win32") {
    // Windows: Nuitka --mode=onefile 产物，单文件可执行
    return "web_api.exe";
  }
  if (process.platform === "darwin") {
    // macOS: Nuitka --mode=app 产物是 .app 目录（PyObjC Foundation 要求 app bundle），
    // 实际二进制在 Contents/MacOS/web_api
    return "web_api.app/Contents/MacOS/web_api";
  }
  // Linux: 无 PyObjC 依赖，onefile 模式输出单文件
  return "web_api";
}
