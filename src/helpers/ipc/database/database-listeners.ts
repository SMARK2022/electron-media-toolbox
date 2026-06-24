import { app, ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import { toErrMsg } from "@/lib/error-utils";

// better-sqlite3 的 Database 实例；用 unknown 收窄前先持有原始引用，
// 避免 db: any 散落到各 handler 内部
let db: Database.Database | null = null;
let cacheDir = "";
let dbPath = "";
let thumbsDir = "";

// 初始化数据库
export const initializeDatabase = () => {
  try {
    if (db) return;

    // macOS 打包后 process.cwd() 为 "/"（不可写），改用 app.getPath("userData")
    // Windows 保持 process.cwd()（与 main.ts 中的 appRoot 保持一致，既有行为不变）
    // 不变量：DB 路径必须可写，且与 main.ts 中的 appRoot 保持一致
    const appRoot =
      process.platform === "darwin" ? app.getPath("userData") : process.cwd();
    cacheDir = path.join(appRoot, ".cache");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    dbPath = path.join(cacheDir, "photos.db");

    thumbsDir = path.join(cacheDir, ".thumbs");
    if (!fs.existsSync(thumbsDir)) {
      fs.mkdirSync(thumbsDir, { recursive: true });
    }

    db = new Database(dbPath);

    // 统一补齐 present/previous 表的所有列（含后续新增列），避免 no such column 报错
    const tables = ["present", "previous"];
    const columns = [
      "fileSize INTEGER",
      "info TEXT",
      "date TEXT",
      "groupId INTEGER",
      "simRefPath TEXT",
      "similarity REAL",
      "IQA REAL",
      "isEnabled INTEGER DEFAULT 1",
      "histH BLOB",
      "histS BLOB",
      "histV BLOB",
      "faceData TEXT",
    ];
    for (const table of tables) {
      for (const col of columns) {
        try {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${col};`);
        } catch (e: unknown) {
          // 首次建表后再次 ADD COLUMN 会报 duplicate column name，属预期可忽略
          if (!toErrMsg(e).includes("duplicate column name")) {
            console.warn(`alter ${table} add ${col} failed:`, toErrMsg(e));
          }
        }
      }
    }

    console.info(`Database initialized: ${dbPath}`);
  } catch (error: unknown) {
    console.error(`Failed to initialize database: ${toErrMsg(error)}`);
  }
};

// 注册 IPC 监听器
export const addDatabaseEventListeners = () => {
  try {
    initializeDatabase();

    if (!db) {
      console.warn("Database not available; IPC handlers will return null");
    }

    // IPC 跨进程参数天然是 unknown，SQLite 绑定参数接受 unknown[]（better-sqlite3 BindParameters）
    ipcMain.handle("db-run", (_event, sql: string, params: unknown) => {
      try {
        if (!db) return null;
        return db.prepare(sql).run(params);
      } catch (error: unknown) {
        console.error(`db-run error: ${toErrMsg(error)}`);
        throw error;
      }
    });

    ipcMain.handle("db-get", (_event, sql: string, params: unknown) => {
      try {
        if (!db) return null;
        return db.prepare(sql).get(params);
      } catch (error: unknown) {
        console.error(`db-get error: ${toErrMsg(error)}`);
        throw error;
      }
    });

    ipcMain.handle("db-all", (_event, sql: string, params: unknown) => {
      try {
        if (!db) return null;
        return db.prepare(sql).all(params);
      } catch (error: unknown) {
        console.error(`db-all error: ${toErrMsg(error)}`);
        throw error;
      }
    });

    ipcMain.handle("db-exec", (_event, sql: string) => {
      try {
        if (!db) return null;
        return db.exec(sql);
      } catch (error: unknown) {
        console.error(`db-exec error: ${toErrMsg(error)}`);
        throw error;
      }
    });

    ipcMain.handle("db-get-path", () => dbPath);
    ipcMain.handle("db-get-thumbs-cache-dir", () => thumbsDir);

    console.info("Database IPC handlers registered");
  } catch (error: unknown) {
    console.error(
      `Failed to register database IPC handlers: ${toErrMsg(error)}`,
    );
  }
};

// 关闭数据库
export const closeDatabase = () => {
  try {
    if (db) {
      db.close();
      db = null;
      console.info("Database closed");
    }
  } catch (error: unknown) {
    console.error(`Failed to close database: ${toErrMsg(error)}`);
  }
};
