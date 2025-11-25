// main/window-listeners.ts

import { BrowserWindow, clipboard, ipcMain, protocol, shell } from "electron";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  WIN_CLOSE_CHANNEL,
  WIN_MAXIMIZE_CHANNEL,
  WIN_MINIMIZE_CHANNEL,
} from "./window-channels";

// 注册自定义协议的 scheme，使其具备安全特性并支持 fetch 等
protocol.registerSchemesAsPrivileged([
  {
    scheme: "local-resource",
    privileges: {
      secure: true,
      supportFetchAPI: true,
      standard: true,
      bypassCSP: true,
      stream: true,
    },
  },
]);

protocol.registerSchemesAsPrivileged([
  {
    scheme: "thumbnail-resource",
    privileges: {
      secure: true,
      supportFetchAPI: true,
      standard: true,
      bypassCSP: true,
      stream: true,
    },
  },
]);

protocol.registerSchemesAsPrivileged([
  {
    scheme: "photo-info",
    privileges: {
      secure: true,
      supportFetchAPI: true,
      standard: true,
      bypassCSP: true,
      stream: true,
    },
  },
]);

/**
 * 为主窗口添加各种 IPC 事件监听。
 * 在创建 BrowserWindow 之后调用该函数。
 */
export function addWindowEventListeners(mainWindow: BrowserWindow) {
  // 窗口最小化
  ipcMain.handle(WIN_MINIMIZE_CHANNEL, () => {
    mainWindow.minimize();
  });

  // 窗口最大化 / 还原
  ipcMain.handle(WIN_MAXIMIZE_CHANNEL, () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  // 关闭窗口
  ipcMain.handle(WIN_CLOSE_CHANNEL, () => {
    mainWindow.close();
  });

  /**
   * 读取本地文件内容（用于 ElectronAPI.readFile）
   */
  ipcMain.handle("read-file", async (_event, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return { success: true, content };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * 从系统剪贴板读取文本内容（用于 ElectronAPI.readClipboard）
   */
  ipcMain.handle("clipboard-read", () => {
    return clipboard.readText();
  });

  /**
   * 在指定工作目录中执行命令（用于 ElectronAPI.runCommand）
   */
  ipcMain.handle(
    "run-command",
    async (_event, cmdStr: string, cmdPath?: string) => {
      return new Promise((resolve, reject) => {
        const workerProcess = exec(cmdStr, { cwd: cmdPath });

        let output = "";
        let errorOutput = "";

        // 标准输出
        workerProcess.stdout?.on("data", (data: string) => {
          output += data;
        });

        // 标准错误输出
        workerProcess.stderr?.on("data", (data: string) => {
          errorOutput += data;
        });

        // 子进程退出后返回结果
        workerProcess.on("close", (code: number) => {
          if (code === 0) {
            resolve(output);
          } else {
            reject({ error: errorOutput, command: cmdStr });
          }
        });
      });
    },
  );

  /**
   * 通过系统默认浏览器打开外部 URL（用于 ElectronAPI.openExternal）
   * 支持 http/https 以及 mailto: 等协议
   */
  ipcMain.handle("open-external", async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error: any) {
      console.error("[open-external] Error:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 使用系统默认程序直接打开本地文件（用于 ElectronAPI.openPath）。
   * 内部通过 shell.openPath，适合用于打开图片、文档等本地文件，
   * 避免在 Windows 上使用 file:/// URL 可能导致的 0x2 找不到文件问题。
   */
  ipcMain.handle("open-path", async (_event, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== "string") {
        throw new Error("Invalid file path");
      }

      const result = await shell.openPath(filePath);
      if (result) {
        // shell.openPath 返回非空字符串表示错误信息
        console.error("[open-path] Error:", result);
        return { success: false, error: result };
      }

      return { success: true };
    } catch (error: any) {
      console.error("[open-path] Exception:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 在系统文件管理器中展示指定文件（用于 ElectronAPI.revealInFolder）。
   */
  ipcMain.handle("reveal-in-folder", async (_event, filePath: string) => {
    try {
      // shell.showItemInFolder 会在系统文件管理器中打开并选中文件
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (error: any) {
      console.error("[reveal-in-folder] Error:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 删除磁盘上的文件（用于 ElectronAPI.deleteFile）。
   * 仅做简单删除，不放入回收站，如需更安全的策略可以后续扩展。
   */
  ipcMain.handle("delete-file", async (_event, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (error: any) {
      console.error("[delete-file] Error:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 获取单张照片的完整元数据（用于 ElectronAPI.getPhotoMetadata）。
   * 优先策略：
   * 1. 如果存在与图片同名的 .json 文件，则读取并返回其中内容；
   * 2. 否则使用 exif-parser 读取图片 EXIF 信息，并补充基础文件属性；
   * 3. 若 EXIF 解析失败，则仅返回基础文件属性。
   *
   * 特别地，会过滤掉：
   * - 二进制或超大数据字段（MakerNote、UserComment、XPComment 等）
   * - 缩略图相关字段（ThumbnailData 等）
   * - 过长的字符串值（>500 字符）
   * 并限制总字段数不超过 50 个。
   */
  ipcMain.handle("get-photo-metadata", async (_event, filePath: string) => {
    try {
      const dir = path.dirname(filePath);
      const base = path.basename(filePath, path.extname(filePath));
      const jsonPath = path.join(dir, `${base}.json`);

      if (fs.existsSync(jsonPath)) {
        const raw = fs.readFileSync(jsonPath, "utf-8");
        const data = JSON.parse(raw);
        return { success: true, data };
      }

      // 如果没有旁路 JSON，则尝试解析 EXIF 信息
      const stat = fs.statSync(filePath);

      const fileSize = stat.size;
      const basic = {
        filePath,
        size: fileSize,
        mtimeMs: stat.mtimeMs,
        ctimeMs: stat.ctimeMs,
        mtime: stat.mtime,
        ctime: stat.ctime,
      } as any;

      try {
        const buffer = fs.readFileSync(filePath);
        const parser = (require("exif-parser") as typeof import("exif-parser")).create(
          buffer,
        );
        const result = parser.parse();

        const tags = result.tags || {};

        // 需要过滤的字段名（包含二进制数据、缩略图等大型字段）
        const EXCLUDED_EXIF_FIELDS = new Set([
          "MakerNote",
          "UserComment",
          "XPComment",
          "XPKeywords",
          "XPTitle",
          "XPSubject",
          "XPAuthor",
          "GPSInfo",
          "ThumbnailData",
          "PreviewImage",
          "ColorSpace",
          "CFAPattern",
          "InteroperabilityIFD",
          "InteroperabilityIndex",
          "Exif",
          "GPS",
          "Interop",
        ]);

        // 衍生出一些更易读的字段
        const captureTime =
          (tags as any).DateTimeOriginal || (tags as any).CreateDate || null;
        const cameraModel = (tags as any).Model || "Unknown Camera";

        // 清理和过滤 EXIF 数据
        const cleanedExifData: Record<string, any> = {};
        let fieldCount = 0;
        const MAX_FIELDS = 200;
        const MAX_STRING_LENGTH = 500;

        for (const [key, value] of Object.entries(tags as any)) {
          // 如果字段数已达上限，停止添加
          if (fieldCount >= MAX_FIELDS) break;

          // 跳过被排除的字段
          if (EXCLUDED_EXIF_FIELDS.has(key)) continue;

          // 过滤过长的字符串和大型对象
          if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
            cleanedExifData[key] = `[String truncated, original length: ${value.length}]`;
            fieldCount++;
          } else if (
            value !== null &&
            typeof value === "object" &&
            !(value instanceof Date) &&
            !Array.isArray(value) &&
            JSON.stringify(value).length > MAX_STRING_LENGTH
          ) {
            // 过滤掉过大的对象
            continue;
          } else if (value === null || value === undefined) {
            continue;
          } else {
            cleanedExifData[key] = value;
            fieldCount++;
          }
        }

        // 添加衍生字段
        if (fieldCount < MAX_FIELDS) {
          if (captureTime) {
            cleanedExifData.captureTime = captureTime;
            fieldCount++;
          }
        }

        if (fieldCount < MAX_FIELDS) {
          cleanedExifData.cameraModel = cameraModel;
          fieldCount++;
        }

        if (fieldCount < MAX_FIELDS) {
          cleanedExifData.fileSize = fileSize;
          fieldCount++;
        }

        const exifData = cleanedExifData;

        const data = {
          ...basic,
          exif: exifData,
        };

        return { success: true, data };
      } catch (exifError: any) {
        console.error("[get-photo-metadata] EXIF parse error:", exifError);
        // EXIF 解析失败时，仍然返回基础信息
        return { success: true, data: basic };
      }
    } catch (error: any) {
      console.error("[get-photo-metadata] Error:", error);
      return { success: false, error: error.message };
    }
  });

  // 说明：
  // - db-get-thumbs-cache-dir / db-run / db-get 等数据库相关 IPC
  //   是在其它模块中注册的，这里不重复定义。
  // - 自定义协议 (local-resource / thumbnail-resource / photo-info) 的
  //   具体 handler（protocol.handle / registerFileProtocol）也应在其它
  //   初始化文件中完成，这里仅保留 scheme 注册。
}
