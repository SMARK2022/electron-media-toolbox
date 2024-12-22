import { BrowserWindow, clipboard, ipcMain } from "electron";
import { WIN_CLOSE_CHANNEL, WIN_MAXIMIZE_CHANNEL, WIN_MINIMIZE_CHANNEL } from "./window-channels";
const fs = require("fs");

const { protocol } = require("electron"); // 引入 protocol 模块，用于注册 schemes

const { exec } = require("child_process");
const path = require("path");


// 我们需要注册一个特别的名称（比如"local-resource"）作为我们的“通行证”。
protocol.registerSchemesAsPrivileged([
    {
        scheme: "local-resource",
        privileges: {
            secure: true, // 让 Electron 信任这个方式就像信任网站的 HTTPS 一样
            supportFetchAPI: true, // 允许我们像在网页上那样请求资源
            standard: true, // 让这种方式的网址看起来像普通的网址
            bypassCSP: true, // 允许我们绕过一些安全限制
            stream: true, // 允许我们以流的形式读取文件，这对于大文件很有用
        },
    },
]);

// 我们需要注册一个特别的名称（比如"local-resource"）作为我们的“通行证”。
protocol.registerSchemesAsPrivileged([
    {
        scheme: "thumbnail-resource",
        privileges: {
            secure: true, // 让 Electron 信任这个方式就像信任网站的 HTTPS 一样
            supportFetchAPI: true, // 允许我们像在网页上那样请求资源
            standard: true, // 让这种方式的网址看起来像普通的网址
            bypassCSP: true, // 允许我们绕过一些安全限制
            stream: true, // 允许我们以流的形式读取文件，这对于大文件很有用
        },
    },
]);

// 我们需要注册一个特别的名称（比如"local-resource"）作为我们的“通行证”。
protocol.registerSchemesAsPrivileged([
    {
        scheme: "photo-info",
        privileges: {
            secure: true, // 让 Electron 信任这个方式就像信任网站的 HTTPS 一样
            supportFetchAPI: true, // 允许我们像在网页上那样请求资源
            standard: true, // 让这种方式的网址看起来像普通的网址
            bypassCSP: true, // 允许我们绕过一些安全限制
            stream: true, // 允许我们以流的形式读取文件，这对于大文件很有用
        },
    },
]);

export function addWindowEventListeners(mainWindow: BrowserWindow) {
    ipcMain.handle(WIN_MINIMIZE_CHANNEL, () => {
        mainWindow.minimize();
    });
    ipcMain.handle(WIN_MAXIMIZE_CHANNEL, () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });
    ipcMain.handle(WIN_CLOSE_CHANNEL, () => {
        mainWindow.close();
    });

    ipcMain.handle("read-file", async (event, filePath) => {
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            return { success: true, content };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // 监听来自渲染进程的请求，返回剪贴板内容
    ipcMain.handle("clipboard-read", () => {
        return clipboard.readText(); // 返回剪贴板的文本内容
    });

    // 注册 IPC 事件来接收命令执行请求
    ipcMain.handle("run-command", async (event, cmdStr, cmdPath) => {
        return new Promise((resolve, reject) => {
            const workerProcess = exec(cmdStr, { cwd: cmdPath });

            let output = "";
            let errorOutput = "";

            // 获取标准输出
            workerProcess.stdout.on("data", (data: string) => {
                output += data;
            });

            // 获取标准错误输出
            workerProcess.stderr.on("data", (data: string) => {
                errorOutput += data;
            });

            // 子进程退出后返回结果
            workerProcess.on("close", (code: number) => {
                if (code === 0) {
                    resolve(output); // 执行成功时返回输出
                } else {
                    reject({ error: errorOutput, command: cmdStr }); // 执行失败时返回错误输出和命令
                }
            });
        });
    });
}
