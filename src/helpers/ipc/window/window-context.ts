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

// 初始化数据库
    const Database = window.require("better-sqlite3");
    const cacheDir = path.join(appRoot, ".cache");
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir);
    }

    const dbPath = path.join(cacheDir, "photos.db");
    const db = new Database(dbPath);

// Initialize thumbnail directory
const thumbsDir = path.join(cacheDir, ".thumbs");
if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir);
}

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

    // 提供安全的数据库操作 API
    contextBridge.exposeInMainWorld("ElectronDB", {
        run: (sql: string, params: any) => db.prepare(sql).run(params), // 执行插入、更新等操作
        get: (sql: string, params: any) => db.prepare(sql).get(params), // 获取单行数据
        all: (sql: string, params: any) => db.prepare(sql).all(params), // 获取多行数据
        exec: (sql: string) => db.exec(sql), // 执行多条 SQL 语句
        getDbPath: () => dbPath, // Expose the database path
        getThumbsPath: () => thumbsDir, // Expose the thumbnail directory path
    });

}
