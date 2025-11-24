// preload/window-context.ts
import * as fs from "fs";
import * as path from "path";
import {
  WIN_CLOSE_CHANNEL,
  WIN_MAXIMIZE_CHANNEL,
  WIN_MINIMIZE_CHANNEL,
} from "./window-channels";

// 获取当前工作目录，即项目根目录（可按需使用）
const appRoot = process.cwd();

/**
 * 在 preload 脚本中调用，用于通过 contextBridge 向渲染进程暴露：
 *   - window.electronWindow：窗口控制相关 API
 *   - window.ElectronAPI：通用工具 API（包含 getPathForFile）
 *   - window.ElectronDB：数据库相关 API
 */
export function exposeWindowContext() {
  // 在 preload 环境中通过 window.require 获取 electron
  const { contextBridge, ipcRenderer, webUtils } = window.require(
    "electron",
  ) as typeof import("electron") & {
    webUtils?: import("electron").WebUtils;
  };

  // 窗口控制 API
  contextBridge.exposeInMainWorld("electronWindow", {
    minimize: () => ipcRenderer.invoke(WIN_MINIMIZE_CHANNEL),
    maximize: () => ipcRenderer.invoke(WIN_MAXIMIZE_CHANNEL),
    close: () => ipcRenderer.invoke(WIN_CLOSE_CHANNEL),
  });

  /**
   * 通用 Electron API：
   * - readFile / readClipboard / getThumbsCacheDir / runCommand（你原来的接口）
   * - getPathForFile：用于从浏览器 File 对象获取绝对路径
   * - openExternal：用于通过系统默认浏览器打开外部 URL
   *
   * getPathForFile 优先使用 Electron 32+ 的 webUtils.getPathForFile，
   * 如果不可用，则回退到旧版 Electron 的 file.path，
   * 再不行则返回空字符串，由渲染层自行退回到 file.name。
   */
  contextBridge.exposeInMainWorld("ElectronAPI", {
    readFile: (file: string) => ipcRenderer.invoke("read-file", file),
    readClipboard: () => ipcRenderer.invoke("clipboard-read"),
    getThumbsCacheDir: () => ipcRenderer.invoke("db-get-thumbs-cache-dir"),
    runCommand: (cmdStr: string, cmdPath?: string) =>
      ipcRenderer.invoke("run-command", cmdStr, cmdPath),

    /**
     * 从 File 对象获取本地绝对路径。
     * @param file 浏览器层的 File 实例（拖拽或 <input type="file"> 得到的）
     * @returns 绝对路径字符串；无法获取时返回空字符串
     */
    getPathForFile(file: File): string {
      // 1) Electron 32+：官方推荐方式
      if (webUtils && typeof webUtils.getPathForFile === "function") {
        try {
          const p = webUtils.getPathForFile(file);
          if (typeof p === "string" && p.length > 0) {
            return p;
          }
        } catch (error) {
          console.error("[ElectronAPI.getPathForFile] webUtils error:", error);
        }
      }

      // 2) 兼容旧版 Electron：File.path 扩展属性
      const anyFile = file as any;
      if (
        anyFile &&
        typeof anyFile.path === "string" &&
        anyFile.path.length > 0
      ) {
        return anyFile.path;
      }

      // 3) 全部失败：返回空字符串，由前端降级处理
      return "";
    },

    /**
     * 通过系统默认浏览器打开外部 URL。
     * 调用主进程的 Electron shell.openExternal 以确保在系统浏览器中打开。
     * @param url 要打开的 URL（支持 http/https 以及 mailto: 等协议）
     */
    openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  });

  /**
   * 提供安全的数据库操作 API（通过 IPC 与主进程通信）
   */
  contextBridge.exposeInMainWorld("ElectronDB", {
    run: (sql: string, params: any) =>
      ipcRenderer.invoke("db-run", sql, params),
    get: (sql: string, params: any) =>
      ipcRenderer.invoke("db-get", sql, params),
    all: (sql: string, params: any) =>
      ipcRenderer.invoke("db-all", sql, params),
    exec: (sql: string) => ipcRenderer.invoke("db-exec", sql),
    getDbPath: () => ipcRenderer.invoke("db-get-path"),
  });
}
