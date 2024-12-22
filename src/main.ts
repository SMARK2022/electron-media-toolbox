import { app, BrowserWindow } from "electron";
import registerListeners from "./helpers/ipc/listeners-register";
// "electron-squirrel-startup" seems broken when packaging with vite
//import started from "electron-squirrel-startup";
import * as fs from "fs";
import path from "path";
import * as zlib from "zlib";
const { protocol } = require("electron"); // 引入 protocol 模块，用于注册 schemes

const inDevelopment = process.env.NODE_ENV === "development";
const exifParser = require("exif-parser"); // 需要安装 exif-parser 库


// 获取应用程序的根目录（打包后也有效）
// 获取当前工作目录，即项目根目录
const appRoot = process.cwd(); 

console.log(`App root: ${appRoot}`); // 打印出 appRoot


function createWindow() {
    const preload = path.join(__dirname, "preload.js");
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 700,
        minHeight: 500,
        webPreferences: {
            devTools: inDevelopment,
            contextIsolation: true,
            nodeIntegration: true,
            nodeIntegrationInSubFrames: false,
            sandbox: false,
            preload: preload,
        },
        titleBarStyle: "hidden",
    });
    registerListeners(mainWindow);

    if (inDevelopment) {
        mainWindow.webContents.openDevTools();
    }

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(
            path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
        );
    }

    // 一个辅助函数，用于处理不同操作系统的文件路径问题
    function convertPath(originalPath: string) {
        const match = originalPath.match(/^\/([a-zA-Z])\/(.*)$/);
        if (match) {
            // 为 Windows 系统转换路径格式
            return `${match[1]}:/${match[2]}`;
        } else {
            return originalPath; // 其他系统直接使用原始路径
        }
    }

    // 告诉 Electron 如何响应你的特殊方式的请求
    protocol.handle("local-resource", async (request) => {
        const decodedUrl = decodeURIComponent(
            request.url.replace(new RegExp(`^local-resource:/`, "i"), "")
        );

        const fullPath = process.platform === "win32" ? convertPath(decodedUrl) : decodedUrl;

        console.log(`Full path: ${fullPath}`); // 打印出 fullPath

        try {
            const data = await fs.promises.readFile(fullPath);
            return new Response(data);
        } catch (error: any) {
            console.error(`Failed to read file: ${(error as Error).message}`);
            return new Response(null, { status: 500 });
        }
    });

    // 注册文件协议
    protocol.handle("thumbnail-resource", async (request) => {
        const decodedUrl = decodeURIComponent(
            request.url.replace(new RegExp(`^thumbnail-resource:/`, "i"), "")
        );

        const fullPath = process.platform === "win32" ? convertPath(decodedUrl) : decodedUrl;
        const normalizedPath = fullPath.replace(/\\/g, "/").toLowerCase();

        // 计算CRC32哈希值
        const crc32 = zlib.crc32(Buffer.from(normalizedPath, "utf-8"));
        const crc32Hex = crc32.toString(16).padStart(8, "0");
        const cacheFolderPath = path.join(appRoot, ".cache/.thumbs");
        // 生成缩略图的完整路径
        const thumbnailPath = path.join(cacheFolderPath, `${crc32Hex}.webp`);

        // console.log(`Thumbnail path: ${thumbnailPath}`); // 打印出缩略图路径

        try {
            const data = await fs.promises.readFile(thumbnailPath);
            return new Response(data); // 返回文件数据
        } catch (error) {
            console.error(`Failed to read thumbnail: ${(error as Error).message}`);
            return new Response(null, { status: 500 }); // 读取失败返回 500 错误
        }
    });


    function getPhotoInfo(imagePath: string): Promise<any> {
        return new Promise((resolve, reject) => {
            fs.stat(imagePath, (err, stats) => {
                if (err) {
                    reject(`Error reading file stats: ${err.message}`);
                    return;
                }

                const fileSize = stats.size; // 文件大小（字节）

                fs.readFile(imagePath, (err, data) => {
                    if (err) {
                        reject(`Error reading file: ${err.message}`);
                        return;
                    }

                    try {
                        const parser = exifParser.create(data);
                        const result = parser.parse();

                        result.tags["captureTime"] = result.tags["DateTimeOriginal"] || result.tags["CreateDate"];
                        result.tags["cameraModel"] = result.tags["Model"] || "Unknown Camera";
                        result.tags["fileSize"] = fileSize;


                        // 返回文件大小和完整的 EXIF 数据
                        resolve(result);
                    } catch (exifError) {
                        reject(`Error parsing EXIF data: ${exifError.message}`);
                    }
                });
            });
        });
    }

    // 注册文件协议来返回照片的信息
    protocol.handle("photo-info", async (request) => {
        const decodedUrl = decodeURIComponent(
            request.url.replace(new RegExp(`^photo-info:/`, "i"), "")
        );

        const fullPath = process.platform === "win32" ? convertPath(decodedUrl) : decodedUrl;

        try {
            // 获取照片信息（大小、拍摄时间、相机信息）
            const photoInfo = await getPhotoInfo(fullPath);

            // 返回包含缩略图数据以及照片信息的响应
            return new Response(JSON.stringify(photoInfo), {
                headers: { "Content-Type": "application/json" },
            });
        } catch (error: any) {
            console.error(`Failed to read photo info or thumbnail: ${(error as Error).message}`);
            return new Response(null, { status: 500 }); // 读取失败返回 500 错误
        }
    });
}

app.whenReady().then(createWindow);

//osX only
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
//osX only ends
