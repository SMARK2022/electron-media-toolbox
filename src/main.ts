import { app, BrowserWindow, protocol } from "electron";
import registerListeners from "./helpers/ipc/listeners-register";
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";
import * as fs from "fs";
import path from "path";
import * as zlib from "zlib";
import { initializeLogger, closeLogger } from "./lib/logger";
import { spawn, type ChildProcess } from "child_process";
import * as http from "http"; // 新增：用于调用后端 /shutdown

// 引入 protocol 模块,用于注册 schemes
const exifParser = require("exif-parser");

/* -------------------------------------------------------------------------- */
/*                               初始化与常量                                   */
/* -------------------------------------------------------------------------- */

// 初始化日志系统（在所有其他代码之前）
initializeLogger();

/**
 * 是否为开发模式：
 * - app.isPackaged 为 false 时，认为是开发环境
 * - 同时兼容 NODE_ENV=development
 */
const inDevelopment = process.env.NODE_ENV === "development" || !app.isPackaged;

console.log("=== Application Starting ===");
console.log(`Is Development: ${inDevelopment}`);
console.log(`Node version: ${process.version}`);
console.log(`Electron version: ${process.versions.electron}`);
console.log("✓ Application initialization started");

// 获取应用程序的根目录（打包后也有效，用于 .cache/.thumbs 等）
const appRoot = process.cwd();
console.log(`App root: ${appRoot}`);

/* -------------------------------------------------------------------------- */
/*                          Python 后端（web_api.exe）管理                      */
/* -------------------------------------------------------------------------- */

let pythonBackend: ChildProcess | null = null;

/**
 * 解析 Python 后端 exe 的路径：
 * - Dev：    <project_root>/python/out/web_api.exe
 * - 打包后： process.resourcesPath/web_api.exe
 */
function resolvePythonBackendPath(): string | null {
  // 当前后端只在 Windows 下有 exe，有其它平台再扩展
  if (process.platform !== "win32") {
    console.log("[PythonBackend] Non-Windows platform, skip backend.");
    return null;
  }

  const exeName = "web_api.exe";

  if (inDevelopment) {
    const devPath = path.join(process.cwd(), "python", "out", exeName);
    if (fs.existsSync(devPath)) {
      console.log("[PythonBackend] Dev exe found at:", devPath);
      return devPath;
    }
    console.warn(
      "[PythonBackend] Dev exe not found at python/out/web_api.exe, skip.",
    );
    return null;
  }

  // 打包后：extraResource 会把 exe 放在 resources 根目录
  const prodPath = path.join(process.resourcesPath, exeName);
  if (fs.existsSync(prodPath)) {
    console.log("[PythonBackend] Packed exe found at:", prodPath);
    return prodPath;
  }

  // 兜底：如果以后你又改回 resources/python/out/web_api.exe，可以兼容一下
  const altPath = path.join(process.resourcesPath, "python", "out", exeName);
  if (fs.existsSync(altPath)) {
    console.log("[PythonBackend] Packed exe found at (alt):", altPath);
    return altPath;
  }

  console.warn(
    "[PythonBackend] No backend exe found in resources, backend will NOT be started.",
  );
  return null;
}

/**
 * 启动 Python 后端：
 * - exe 不存在则直接跳过
 * - 开发模式下使用 stdio: "inherit" 方便调试；打包后用 "ignore" 静音
 */
function startPythonBackend() {
  const exePath = resolvePythonBackendPath();
  if (!exePath) return;

  console.log(`[PythonBackend] Starting backend: ${exePath}`);

  try {
    pythonBackend = spawn(exePath, [], {
      stdio: inDevelopment ? "inherit" : "ignore",
      windowsHide: !inDevelopment,
    });

    pythonBackend.on("exit", (code, signal) => {
      console.log(
        `[PythonBackend] Backend exited. code=${code}, signal=${signal}`,
      );
      pythonBackend = null;
    });

    pythonBackend.on("error", (err) => {
      console.error("[PythonBackend] Failed to start backend:", err);
      pythonBackend = null;
    });
  } catch (err) {
    console.error("[PythonBackend] spawn() threw:", err);
  }
}

/**
 * 向 Python 后端发送 /shutdown 请求，让它自己调用 os._exit(0)
 * 注意：
 * - 使用 Node 的 http 模块，手动 unref socket，避免阻塞事件循环
 * - 如果端口没开 / 请求失败，直接忽略
 */
function requestBackendShutdown() {
  // 目前后端固定跑在 8000 端口
  const options: http.RequestOptions = {
    host: "127.0.0.1",
    port: 8000,
    path: "/shutdown",
    method: "POST",
    timeout: 1000,
  };

  try {
    const req = http.request(options, (res) => {
      // 不关心响应内容，直接吃掉数据并在结束时 unref socket
      res.on("data", () => {});
      res.on("end", () => {
        res.socket?.unref();
      });
    });

    // socket 一建立就 unref，确保这个请求不会阻止进程退出
    req.on("socket", (socket) => {
      socket.unref();
    });

    req.on("error", (err) => {
      console.warn("[PythonBackend] /shutdown request error:", err);
    });

    req.on("timeout", () => {
      req.destroy();
    });

    req.end();
  } catch (err) {
    console.warn("[PythonBackend] Failed to send /shutdown request:", err);
  }
}

/**
 * 终止 Python 后端：
 * - 首选：HTTP /shutdown，让后端自己优雅退出（触发 SIGINT）
 * - 然后等待一段时间，看看进程是否退出（通过 'exit' 事件）
 * - 最后兜底：在 Windows 上用不带 /F 的 taskkill，尽量给系统一个正常关闭的机会
 *
 * 注意：
 * - 不再主动调用 pythonBackend.kill()（在 Windows 上是 TerminateProcess，和 /F 类似）
 * - 真正“强杀”（/F）的兜底可以留给用户手动在任务管理器中点掉
 */
function stopPythonBackend() {
  console.log("[PythonBackend] Stopping backend...");

  // 1) 首先请求后端优雅关闭（触发 /shutdown -> SIGINT）
  requestBackendShutdown();

  if (!pythonBackend) {
    return;
  }

  console.log("[PythonBackend] Waiting for backend process to exit by itself...");

  // 2) 等待一段时间（例如 5 秒），如果仍未退出，再尝试软兜底
  const backend = pythonBackend;
  pythonBackend = null; // 标记为正在关闭

  const timeoutMs = 3000;

  setTimeout(() => {
    // 如果进程已经退出，就什么都不做
    if (backend.killed) {
      console.log("[PythonBackend] Backend already killed/exit, no further action.");
      return;
    }

    console.warn("[PythonBackend] Backend still alive after shutdown request, trying soft kill...");

    if (process.platform === "win32") {
      // 3) Windows 兜底：不带 /F，只发送正常关闭信号，让系统尽量优雅结束进程
      const { spawn } = require("child_process");
      const child = spawn("taskkill", ["/IM", "web_api.exe", "/T"], {
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", (err: Error) => {
        console.warn("[PythonBackend] taskkill error:", err);
      });
    } else {
      // 非 Windows：常规 SIGTERM 即可（不等同于 TerminateProcess）
      try {
        backend.kill("SIGTERM");
      } catch (err) {
        console.warn("[PythonBackend] backend.kill(SIGTERM) error:", err);
      }
    }
  }, timeoutMs);
}


/* -------------------------------------------------------------------------- */
/*                                 主窗口创建                                   */
/* -------------------------------------------------------------------------- */

function createWindow() {
  const preload = path.join(__dirname, "preload.js");

  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      sandbox: false,
      preload,
    },
    titleBarStyle: "hidden",
    title: "Electron Media Toolbox", // 设置窗口名
  });

  registerListeners(mainWindow);

  if (inDevelopment) {
    mainWindow.webContents.openDevTools();
  }
  // 如果你觉得两次 openDevTools 太吵，可以删掉这一行
  mainWindow.webContents.openDevTools();

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  /* ------------------------------ 协议处理: 本地文件 ------------------------------ */

  // 跨平台路径转换（仅在 Windows 下进行 /C/ -> C:/ 转换）
  function convertPath(originalPath: string): string {
    const match = originalPath.match(/^\/([a-zA-Z])\/(.*)$/);
    return match ? `${match[1]}:/${match[2]}` : originalPath;
  }

  // local-resource:// 读取原始文件
  protocol.handle("local-resource", async (request: Request) => {
    const decodedUrl = decodeURIComponent(
      request.url.replace(new RegExp(`^local-resource:/`, "i"), ""),
    );
    const fullPath =
      process.platform === "win32" ? convertPath(decodedUrl) : decodedUrl;

    console.log(`Full path: ${fullPath}`);

    try {
      const data = await fs.promises.readFile(fullPath);
      // Buffer -> Response 的类型不总是能被 TS 精确推断，使用 as any 以兼容运行时 API
      return new Response(data as any);
    } catch (error: any) {
      console.error(`Failed to read file: ${error.message as string}`);
      return new Response(null, { status: 500 });
    }
  });

  /* ------------------------------ 协议处理: 缩略图 ------------------------------ */

  protocol.handle("thumbnail-resource", async (request: Request) => {
    const decodedUrl = decodeURIComponent(
      request.url.replace(new RegExp(`^thumbnail-resource:/`, "i"), ""),
    );

    const fullPath =
      process.platform === "win32" ? convertPath(decodedUrl) : decodedUrl;
    const normalizedPath = fullPath.replace(/\\/g, "/").toLowerCase();

    // 计算 CRC32 哈希值（用于缩略图缓存命名）
    const crc32 = (zlib as any).crc32(Buffer.from(normalizedPath, "utf-8"));
    const crc32Hex = crc32.toString(16).padStart(8, "0");

    const cacheFolderPath = path.join(appRoot, ".cache/.thumbs");
    const thumbnailPath = path.join(cacheFolderPath, `${crc32Hex}.webp`);

    try {
      const data = await fs.promises.readFile(thumbnailPath);
      return new Response(data as any);
    } catch (error) {
      console.error(`Failed to read thumbnail: ${(error as Error).message}`);
      return new Response(null, { status: 500 });
    }
  });

  /* ------------------------------ 协议处理: 照片信息 ------------------------------ */

  function getPhotoInfo(imagePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      console.log(`Getting photo info for: ${imagePath}`);

      fs.stat(imagePath, (statErr, stats) => {
        if (statErr) {
          reject(`Error reading file stats: ${statErr.message}`);
          return;
        }

        const fileSize = stats.size; // 文件大小（字节）

        fs.readFile(imagePath, (readErr, data) => {
          if (readErr) {
            reject(`Error reading file: ${readErr.message}`);
            return;
          }

          try {
            const parser = exifParser.create(data);
            const result = parser.parse();

            console.log(`✓ Successfully parsed EXIF data for: ${imagePath}`);

            result.tags["captureTime"] =
              result.tags["DateTimeOriginal"] || result.tags["CreateDate"];
            result.tags["cameraModel"] =
              result.tags["Model"] || "Unknown Camera";
            result.tags["fileSize"] = fileSize;

            resolve(result);
          } catch (exifError: any) {
            const errorMsg = `Error parsing EXIF data: ${exifError.message}`;
            console.log(`✗ ${errorMsg}`);
            reject(errorMsg);
          }
        });
      });
    });
  }

  // photo-info:// 返回照片 EXIF 与文件信息
  protocol.handle("photo-info", async (request: Request) => {
    const decodedUrl = decodeURIComponent(
      request.url.replace(new RegExp(`^photo-info:/`, "i"), ""),
    );

    const fullPath =
      process.platform === "win32" ? convertPath(decodedUrl) : decodedUrl;

    try {
      const photoInfo = await getPhotoInfo(fullPath);
      return new Response(JSON.stringify(photoInfo), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error(
        `Failed to read photo info or thumbnail: ${error.message as string}`,
      );
      return new Response(null, { status: 500 });
    }
  });
}

/* -------------------------------------------------------------------------- */
/*                            DevTools 扩展安装与事件                            */
/* -------------------------------------------------------------------------- */

async function installExtensions() {
  try {
    const result = await installExtension(REACT_DEVELOPER_TOOLS);
    console.log(`Extensions installed successfully: ${result.name}`);
  } catch {
    console.log("Failed to install extensions");
    console.error("Failed to install extensions");
  }
}

/**
 * 启动流程：
 * - app.ready 后先尝试启动 Python 后端（若 exe 存在）
 * - 再创建主窗口
 * - 开发环境下安装 React DevTools
 */
app
  .whenReady()
  .then(() => {
    startPythonBackend();
    createWindow();
  })
  .then(() => {
    if (inDevelopment) {
      return installExtensions();
    }
    return;
  });

/* --------------------------------- macOS 专用 -------------------------------- */

app.on("window-all-closed", () => {
  console.log("All windows closed");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  console.log("App activated");
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

/* -------------------------------------------------------------------------- */
/*                                   退出收尾                                   */
/* -------------------------------------------------------------------------- */

app.on("before-quit", () => {
  console.log("App before-quit, stopping backend...");
  stopPythonBackend();
});

app.on("quit", () => {
  console.log("=== Application Exiting ===");
  closeLogger();
});
