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

  // 说明：
  // - db-get-thumbs-cache-dir / db-run / db-get 等数据库相关 IPC
  //   是在其它模块中注册的，这里不重复定义。
  // - 自定义协议 (local-resource / thumbnail-resource / photo-info) 的
  //   具体 handler（protocol.handle / registerFileProtocol）也应在其它
  //   初始化文件中完成，这里仅保留 scheme 注册。
}
