import * as fs from "fs";
import * as path from "path";
import {
    WIN_CLOSE_CHANNEL,
    WIN_MAXIMIZE_CHANNEL,
    WIN_MINIMIZE_CHANNEL,
} from "./window-channels";

// 获取应用程序的根目录（打包后也有效）
// 获取当前工作目录，即项目根目录
const appRoot = process.cwd();

export function exposeWindowContext() {
    const { contextBridge, ipcRenderer } = window.require("electron");
    contextBridge.exposeInMainWorld("electronWindow", {
        minimize: () => ipcRenderer.invoke(WIN_MINIMIZE_CHANNEL),
        maximize: () => ipcRenderer.invoke(WIN_MAXIMIZE_CHANNEL),
        close: () => ipcRenderer.invoke(WIN_CLOSE_CHANNEL),
    });
    contextBridge.exposeInMainWorld("electronAPI", {
        readFile: (file: string) => ipcRenderer.invoke("read-file", file),
        readClipboard: () => ipcRenderer.invoke("clipboard-read"), // 用于读取剪贴板内容
        runCommand: (cmdStr: string, cmdPath: string) =>
            ipcRenderer.invoke("run-command", cmdStr, cmdPath),
    });

    // 提供安全的数据库操作 API（通过 IPC 与主进程通信）
    contextBridge.exposeInMainWorld("ElectronDB", {
        run: (sql: string, params: any) => ipcRenderer.invoke("db-run", sql, params),
        get: (sql: string, params: any) => ipcRenderer.invoke("db-get", sql, params),
        all: (sql: string, params: any) => ipcRenderer.invoke("db-all", sql, params),
        exec: (sql: string) => ipcRenderer.invoke("db-exec", sql),
        getDbPath: () => ipcRenderer.invoke("db-get-path"),
        getThumbsPath: () => ipcRenderer.invoke("db-get-thumbs-path"),
    });

}
