"use strict";
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
process.cwd();
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
    run: (sql, params) => ipcRenderer.invoke("db-run", sql, params),
    get: (sql, params) => ipcRenderer.invoke("db-get", sql, params),
    all: (sql, params) => ipcRenderer.invoke("db-all", sql, params),
    exec: (sql) => ipcRenderer.invoke("db-exec", sql),
    getDbPath: () => ipcRenderer.invoke("db-get-path"),
    getThumbsPath: () => ipcRenderer.invoke("db-get-thumbs-path")
  });
}
function exposeContexts() {
  exposeWindowContext();
  exposeThemeContext();
}
exposeContexts();
