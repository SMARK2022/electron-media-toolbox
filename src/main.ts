import { app, BrowserWindow } from "electron";
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
const { protocol } = require("electron"); // 引入 protocol 模块,用于注册 schemes

/* -------------------------------------------------------------------------- */
/*                               初始化与常量                                   */
/* -------------------------------------------------------------------------- */

// 初始化日志系统（在所有其他代码之前）
initializeLogger();

// 延迟加载的外部模块句柄
let exifParser: any;
let betterSqlite3: any;

// 延迟加载标志
let exifParserInitialized = false;
// let betterSqlite3Initialized = false;

const inDevelopment = process.env.NODE_ENV === "development";
// const inDevelopment = true;

console.log("=== Application Starting ===");
console.log(`Is Development: ${inDevelopment}`);
console.log(`Node version: ${process.version}`);
console.log(`Electron version: ${process.versions.electron}`);
console.log("✓ Application initialization started");

// 获取应用程序的根目录（打包后也有效）
const appRoot = process.cwd();
console.log(`App root: ${appRoot}`);

/* -------------------------------------------------------------------------- */
/*                              动态加载模块工具                                 */
/* -------------------------------------------------------------------------- */

const loadModule = (moduleName: string): any => {
  try {
    // 开发环境优先使用标准方式加载
    return require(moduleName);
  } catch (error: any) {
    console.error(`✗ Standard require for '${moduleName}' failed: ${error.message}`);

    // 打包环境：尝试从 resources 路径加载
    try {
      const appPath = app.getAppPath();
      let resourcePath = "";

      if (appPath.includes("asar")) {
        // /path/to/app.asar -> /path/to
        const asarRoot = appPath.substring(0, appPath.indexOf("app.asar"));
        resourcePath = path.join(asarRoot, moduleName);
      } else {
        // 开发模式的备用路径
        resourcePath = path.join(appPath, "..", moduleName);
      }

      console.log(`Attempting to load '${moduleName}' from: ${resourcePath}`);
      const mod = require(resourcePath);
      console.log(`✓ '${moduleName}' loaded from resources`);
      return mod;
    } catch (error2: any) {
      console.error(`✗ Loading '${moduleName}' from resources failed: ${error2.message}`);

      // 最后的备用路径
      try {
        const execPath = process.execPath;
        const exeDir = path.dirname(execPath);
        const resourcePath2 = path.join(exeDir, "resources", moduleName);

        console.log(`Attempting backup path for '${moduleName}': ${resourcePath2}`);
        const mod = require(resourcePath2);
        console.log(`✓ '${moduleName}' loaded from backup path`);
        return mod;
      } catch (error3: any) {
        console.error(`✗ Backup path for '${moduleName}' also failed: ${error3.message}`);
        return null;
      }
    }
  }
};

// 动态加载 exif-parser 和 better-sqlite3
const loadExifParser = (): boolean => {
  if (exifParser) return true;
  exifParser = loadModule("exif-parser");
  return exifParser !== null;
};

// const loadBetterSqlite3 = (): boolean => {
//   if (betterSqlite3) return true;
//   betterSqlite3 = loadModule("better-sqlite3");
//   return betterSqlite3 !== null;
// };

/* -------------------------------------------------------------------------- */
/*                                 主窗口创建                                   */
/* -------------------------------------------------------------------------- */

function createWindow() {
  // 在窗口创建时加载必要的模块
  if (!exifParserInitialized) {
    exifParserInitialized = loadExifParser();
    if (exifParserInitialized && exifParser && typeof exifParser.create === "function") {
      console.log("✓ exif-parser loaded successfully");
    } else {
      console.error("✗ exif-parser module not properly loaded");
    }
  }

  // if (!betterSqlite3Initialized) {
  //   betterSqlite3Initialized = loadBetterSqlite3();
  //   if (betterSqlite3Initialized && betterSqlite3) {
  //     console.log("✓ better-sqlite3 loaded successfully");
  //   } else {
  //     console.error("✗ better-sqlite3 module not properly loaded");
  //   }
  // }

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
  // 保留原行为：再次显式打开 DevTools
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
  protocol.handle("local-resource", async (request) => {
    const decodedUrl = decodeURIComponent(
      request.url.replace(new RegExp(`^local-resource:/`, "i"), ""),
    );
    const fullPath = process.platform === "win32" ? convertPath(decodedUrl) : decodedUrl;

    console.log(`Full path: ${fullPath}`);

    try {
      const data = await fs.promises.readFile(fullPath);
      return new Response(data);
    } catch (error: any) {
      console.error(`Failed to read file: ${error.message as string}`);
      return new Response(null, { status: 500 });
    }
  });

  /* ------------------------------ 协议处理: 缩略图 ------------------------------ */

  protocol.handle("thumbnail-resource", async (request) => {
    const decodedUrl = decodeURIComponent(
      request.url.replace(new RegExp(`^thumbnail-resource:/`, "i"), ""),
    );

    const fullPath = process.platform === "win32" ? convertPath(decodedUrl) : decodedUrl;
    const normalizedPath = fullPath.replace(/\\/g, "/").toLowerCase();

    // 计算 CRC32 哈希值（用于缩略图缓存命名）
    const crc32 = (zlib as any).crc32(Buffer.from(normalizedPath, "utf-8"));
    const crc32Hex = crc32.toString(16).padStart(8, "0");

    const cacheFolderPath = path.join(appRoot, ".cache/.thumbs");
    const thumbnailPath = path.join(cacheFolderPath, `${crc32Hex}.webp`);

    try {
      const data = await fs.promises.readFile(thumbnailPath);
      return new Response(data);
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
            result.tags["cameraModel"] = result.tags["Model"] || "Unknown Camera";
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
  protocol.handle("photo-info", async (request) => {
    const decodedUrl = decodeURIComponent(
      request.url.replace(new RegExp(`^photo-info:/`, "i"), ""),
    );

    const fullPath = process.platform === "win32" ? convertPath(decodedUrl) : decodedUrl;

    try {
      const photoInfo = await getPhotoInfo(fullPath);
      return new Response(JSON.stringify(photoInfo), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error(`Failed to read photo info or thumbnail: ${error.message as string}`);
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

app.whenReady().then(createWindow).then(installExtensions);

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

app.on("quit", () => {
  console.log("=== Application Exiting ===");
  closeLogger();
});
