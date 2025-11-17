import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

let logFilePath: string = "";
let logStream: fs.WriteStream | null = null;

/**
 * 初始化日志系统
 * 将 console 输出重定向到文件，便于在打包版本中调试
 */
export const initializeLogger = () => {
  try {
    // 确定日志文件位置
    const logsDir = path.join(app.getPath("userData"), "logs");

    // 如果目录不存在，创建它
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // 生成带时间戳的日志文件名
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .split("T")[0];
    logFilePath = path.join(logsDir, `app-${timestamp}.log`);

    // 创建写入流
    logStream = fs.createWriteStream(logFilePath, { flags: "a" });

    // 写入启动标记
    const startMsg = `\n${"=".repeat(50)}\nApplication started at ${new Date().toISOString()}\n${"=".repeat(50)}\n`;
    logStream.write(startMsg);

    // 重定向 console 方法
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    console.log = (...args: any[]) => {
      const message = args
        .map((arg) => {
          if (typeof arg === "object") {
            return JSON.stringify(arg, null, 2);
          }
          return String(arg);
        })
        .join(" ");

      const formattedMsg = `[LOG] ${new Date().toISOString()} ${message}\n`;
      if (logStream) logStream.write(formattedMsg);
      originalLog(...args);
    };

    console.error = (...args: any[]) => {
      const message = args
        .map((arg) => {
          if (typeof arg === "object") {
            return JSON.stringify(arg, null, 2);
          }
          return String(arg);
        })
        .join(" ");

      const formattedMsg = `[ERROR] ${new Date().toISOString()} ${message}\n`;
      if (logStream) logStream.write(formattedMsg);
      originalError(...args);
    };

    console.warn = (...args: any[]) => {
      const message = args
        .map((arg) => {
          if (typeof arg === "object") {
            return JSON.stringify(arg, null, 2);
          }
          return String(arg);
        })
        .join(" ");

      const formattedMsg = `[WARN] ${new Date().toISOString()} ${message}\n`;
      if (logStream) logStream.write(formattedMsg);
      originalWarn(...args);
    };

    console.info = (...args: any[]) => {
      const message = args
        .map((arg) => {
          if (typeof arg === "object") {
            return JSON.stringify(arg, null, 2);
          }
          return String(arg);
        })
        .join(" ");

      const formattedMsg = `[INFO] ${new Date().toISOString()} ${message}\n`;
      if (logStream) logStream.write(formattedMsg);
      originalInfo(...args);
    };

    console.log(`✓ Logger initialized, log file: ${logFilePath}`);
    return logFilePath;
  } catch (error: any) {
    console.error(`✗ Failed to initialize logger: ${error.message}`);
    return null;
  }
};

/**
 * 获取日志文件路径
 */
export const getLogFilePath = () => logFilePath;

/**
 * 关闭日志流
 */
export const closeLogger = () => {
  if (logStream) {
    const endMsg = `Application ended at ${new Date().toISOString()}\n${"=".repeat(50)}\n`;
    logStream.write(endMsg);
    logStream.end();
    logStream = null;
  }
};
