import { ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";

// 数据库相关变量
let db: any = null;
let cacheDir = "";
let dbPath = "";
let thumbsDir = "";

// 初始化数据库
export const initializeDatabase = () => {
  try {
    if (db) return;

    const appRoot = process.cwd();
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
        } catch (e: any) {
          if (!String(e?.message ?? "").includes("duplicate column name")) {
            console.warn(`alter ${table} add ${col} failed:`, e?.message ?? e);
          }
        }
      }
    }

    console.info(`Database initialized: ${dbPath}`);
  } catch (error: any) {
    console.error(`Failed to initialize database: ${error?.message ?? error}`);
  }
};

// 注册 IPC 监听器
export const addDatabaseEventListeners = () => {
  try {
    initializeDatabase();

    if (!db) {
      console.warn("Database not available; IPC handlers will return null");
    }

    ipcMain.handle("db-run", (_event, sql: string, params: any) => {
      try {
        if (!db) return null;
        return db.prepare(sql).run(params);
      } catch (error: any) {
        console.error(`db-run error: ${error?.message ?? error}`);
        throw error;
      }
    });

    ipcMain.handle("db-get", (_event, sql: string, params: any) => {
      try {
        if (!db) return null;
        return db.prepare(sql).get(params);
      } catch (error: any) {
        console.error(`db-get error: ${error?.message ?? error}`);
        throw error;
      }
    });

    ipcMain.handle("db-all", (_event, sql: string, params: any) => {
      try {
        if (!db) return null;
        return db.prepare(sql).all(params);
      } catch (error: any) {
        console.error(`db-all error: ${error?.message ?? error}`);
        throw error;
      }
    });

    ipcMain.handle("db-exec", (_event, sql: string) => {
      try {
        if (!db) return null;
        return db.exec(sql);
      } catch (error: any) {
        console.error(`db-exec error: ${error?.message ?? error}`);
        throw error;
      }
    });

    ipcMain.handle("db-get-path", () => dbPath);
    ipcMain.handle("db-get-thumbs-cache-dir", () => thumbsDir);

    console.info("Database IPC handlers registered");
  } catch (error: any) {
    console.error(
      `Failed to register database IPC handlers: ${error?.message ?? error}`,
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
  } catch (error: any) {
    console.error(`Failed to close database: ${error?.message ?? error}`);
  }
};
