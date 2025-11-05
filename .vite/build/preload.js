"use strict";
const fs = require("fs");
const path = require("path");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const THEME_MODE_CURRENT_CHANNEL = "theme-mode:current";
const THEME_MODE_TOGGLE_CHANNEL = "theme-mode:toggle";
const THEME_MODE_DARK_CHANNEL = "theme-mode:dark";
const THEME_MODE_LIGHT_CHANNEL = "theme-mode:light";
const THEME_MODE_SYSTEM_CHANNEL = "theme-mode:system";
function exposeThemeContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");
  contextBridge.exposeInMainWorld("themeMode", {
    current: () => ipcRenderer.invoke(THEME_MODE_CURRENT_CHANNEL),
    toggle: () => ipcRenderer.invoke(THEME_MODE_TOGGLE_CHANNEL),
    dark: () => ipcRenderer.invoke(THEME_MODE_DARK_CHANNEL),
    light: () => ipcRenderer.invoke(THEME_MODE_LIGHT_CHANNEL),
    system: () => ipcRenderer.invoke(THEME_MODE_SYSTEM_CHANNEL)
  });
}
const WIN_MINIMIZE_CHANNEL = "window:minimize";
const WIN_MAXIMIZE_CHANNEL = "window:maximize";
const WIN_CLOSE_CHANNEL = "window:close";
const appRoot = process.cwd();
const Database = window.require("better-sqlite3");
const cacheDir = path__namespace.join(appRoot, ".cache");
if (!fs__namespace.existsSync(cacheDir)) {
  fs__namespace.mkdirSync(cacheDir);
}
const dbPath = path__namespace.join(cacheDir, "photos.db");
const db = new Database(dbPath);
const thumbsDir = path__namespace.join(cacheDir, ".thumbs");
if (!fs__namespace.existsSync(thumbsDir)) {
  fs__namespace.mkdirSync(thumbsDir);
}
function exposeWindowContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");
  contextBridge.exposeInMainWorld("electronWindow", {
    minimize: () => ipcRenderer.invoke(WIN_MINIMIZE_CHANNEL),
    maximize: () => ipcRenderer.invoke(WIN_MAXIMIZE_CHANNEL),
    close: () => ipcRenderer.invoke(WIN_CLOSE_CHANNEL)
  });
  contextBridge.exposeInMainWorld("electronAPI", {
    readFile: (file) => ipcRenderer.invoke("read-file", file),
    readClipboard: () => ipcRenderer.invoke("clipboard-read"),
    // 用于读取剪贴板内容
    runCommand: (cmdStr, cmdPath) => ipcRenderer.invoke("run-command", cmdStr, cmdPath)
  });
  contextBridge.exposeInMainWorld("ElectronDB", {
    run: (sql, params) => db.prepare(sql).run(params),
    // 执行插入、更新等操作
    get: (sql, params) => db.prepare(sql).get(params),
    // 获取单行数据
    all: (sql, params) => db.prepare(sql).all(params),
    // 获取多行数据
    exec: (sql) => db.exec(sql),
    // 执行多条 SQL 语句
    getDbPath: () => dbPath,
    // Expose the database path
    getThumbsPath: () => thumbsDir
    // Expose the thumbnail directory path
  });
}
function exposeContexts() {
  exposeWindowContext();
  exposeThemeContext();
}
exposeContexts();
