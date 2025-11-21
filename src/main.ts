import { app, BrowserWindow, protocol } from "electron";
import registerListeners from "./helpers/ipc/listeners-register";
// "electron-squirrel-startup" seems broken when packaging with vite
// import started from "electron-squirrel-startup";
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";
import * as fs from "fs";
import path from "path";
import * as zlib from "zlib";
import { initializeLogger, closeLogger } from "./lib/logger";
// 引入 protocol 模块,用于注册 schemes
const exifParser = require("exif-parser");
import { spawn, ChildProcess } from "node:child_process";

/* -------------------------------------------------------------------------- */
/*                               初始化与常量                                   */
/* -------------------------------------------------------------------------- */

// 初始化日志系统（在所有其他代码之前）
initializeLogger();

const inDevelopment = process.env.NODE_ENV === "development";
// const inDevelopment = true;

console.log("=== Application Starting ===");
console.log(`Is Development: ${inDevelopment}`);
console.log(`Node version: ${process.version}`);
console.log(`Electron version: ${process.versions.electron}`);
console.log("✓ Application initialization started");

// 获取应用程序的根目录（打包后也有效）
// —— 开发环境下：通常是项目根目录
// —— 打包后：通常是安装目录
const appRoot = process.cwd();
console.log(`App root: ${appRoot}`);

/* -------------------------------------------------------------------------- */
/*                           Python 后端进程管理逻辑                            */
/* -------------------------------------------------------------------------- */

let pythonBackend: ChildProcess | null = null;

/**
 * 根据当前环境，推断 web_api.exe 的路径：
 * - 开发环境：<项目根>/python/out/web_api.exe
 * - 打包环境：<resources>/python/out/web_api.exe  （通过 extraResource 打进去）
 */
function getPythonBackendPath(): string | null {
  if (process.platform !== "win32") {
    // 当前只在 Windows 上用 .exe，有需要可以扩展其他平台
    console.log("[PythonBackend] Non-Windows platform, skip backend.");
    return null;
  }

  // 开发环境：直接从项目根目录查找
  if (inDevelopment) {
    const devPath = path.join(appRoot, "python", "out", "web_api.exe");
    if (fs.existsSync(devPath)) {
      console.log("[PythonBackend] Found backend exe (dev):", devPath);
      return devPath;
    }
  }

  // 打包环境：通过 extraResource 打到 resources/python/out/web_api.exe
  const prodPath = path.join(
    process.resourcesPath,
    "python",
    "out",
    "web_api.exe",
  );
  if (fs.existsSync(prodPath)) {
    console.log("[PythonBackend] Found backend exe (prod):", prodPath);
    return prodPath;
  }

  console.log(
    "[PythonBackend] web_api.exe not found in either dev or prod path, skip starting backend.",
  );
  return null;
}

/**
 * 启动 Python 后端（如果 exe 存在）
 */
function startPythonBackend() {
  const exePath = getPythonBackendPath();
  if (!exePath) {
    return;
  }
  if (pythonBackend) {
    console.log("[PythonBackend] Backend already running, skip.");
    return;
  }

  console.log("[PythonBackend] Starting backend:", exePath);
  try {
    pythonBackend = spawn(exePath, [], {
      cwd: path.dirname(exePath),
      // 开发环境继承输出到控制台，方便调试；打包后可选择忽略或重定向
      stdio: inDevelopment ? "inherit" : "ignore",
      windowsHide: false,
    });

    pythonBackend.on("exit", (code, signal) => {
      console.log(
        `[PythonBackend] Process exited with code=${code}, signal=${signal}`,
      );
      pythonBackend = null;
    });

    pythonBackend.on("error", (err) => {
      console.error("[PythonBackend] Failed to start backend:", err);
      pythonBackend = null;
    });
  } catch (err) {
    console.error("[PythonBackend] Exception while starting backend:", err);
    pythonBackend = null;
  }
}

/**
 * 停止 Python 后端（如果已启动）
 */
function stopPythonBackend() {
  if (!pythonBackend) {
    return;
  }
  if (pythonBackend.killed) {
    pythonBackend = null;
    return;
  }

  console.log("[PythonBackend] Stopping backend...");
  try {
    // Windows 下直接 kill 即可（映射到 TerminateProcess）
    pythonBackend.kill();
  } catch (err) {
    console.error("[PythonBackend] Error when killing backend:", err);
  } finally {
    pythonBackend = null;
  }
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
  // 保留原行为：再次显式打开 DevTools（如果你觉得多余，也可以删掉这一行）
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
 * 1. app.whenReady
 * 2. 启动 Python 后端（如果 exe 存在）
 * 3. 创建主窗口
 * 4. 安装 React DevTools（dev 模式）
 */
app
  .whenReady()
  .then(() => {
    startPythonBackend();
    return createWindow();
  })
  .then(installExtensions);

/* --------------------------------- macOS 专用 -------------------------------- */

app.on("window-all-closed", () => {
  console.log("All windows closed");
  // 非 macOS：当所有窗口关闭时，退出应用（并一起关掉后端）
  if (process.platform !== "darwin") {
    stopPythonBackend();
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
  console.log("[Lifecycle] before-quit");
  // 再保险：退出前尝试关闭后端
  stopPythonBackend();
});

app.on("quit", () => {
  console.log("=== Application Exiting ===");
  // 这里再调用一次也无妨（stopPythonBackend 内部做了空检查）
  stopPythonBackend();
  closeLogger();
});
