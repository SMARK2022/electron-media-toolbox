import { ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

// 数据库相关变量
let db: any = null;
let cacheDir = "";
let dbPath = "";
let thumbsDir = "";
import Database from "better-sqlite3";

/* -------------------------------------------------------------------------- */
/*                              动态加载模块工具                                 */
/* -------------------------------------------------------------------------- */

const loadModule = (moduleName: string, silent: boolean = false): any => {
  try {
    // 开发环境优先使用标准方式加载
    return require(moduleName);
  } catch (error: any) {
    if (!silent) {
      console.log(`Attempting to load '${moduleName}' from resources...`);
    }

    // 打包环境：尝试从 resources 路径加载
    try {
      const appPath = app.getAppPath();
      let resourcePath = "";

      if (appPath.includes("asar")) {
        // /path/to/app.asar -> /path/to
        const asarRoot = appPath.substring(0, appPath.indexOf("app.asar"));
        resourcePath = path.join(asarRoot, moduleName);
      } else {
        // 开发模式的备用路径
        resourcePath = path.join(appPath, "..", moduleName);
      }

      const mod = require(resourcePath);
      console.log(`✓ '${moduleName}' loaded from resources`);
      return mod;
    } catch (error2: any) {
      if (!silent) {
        console.log(`Attempting backup path for '${moduleName}'...`);
      }

      // 最后的备用路径
      try {
        const execPath = process.execPath;
        const exeDir = path.dirname(execPath);
        const resourcePath2 = path.join(exeDir, "resources", moduleName);

        const mod = require(resourcePath2);
        console.log(`✓ '${moduleName}' loaded from backup path`);
        return mod;
      } catch (error3: any) {
        console.error(`✗ Failed to load '${moduleName}': ${error3.message}`);
        return null;
      }
    }
  }
};

// // 动态加载 better-sqlite3 及其依赖
// const loadBetterSqlite3 = (): any => {
//     if (Database) return Database;
    
//     // 先预加载 bindings 和 prebuild-install 这些 better-sqlite3 的关键依赖
//     loadModule("bindings", true);
//     loadModule("prebuild-install", true);
    
//     // 使用统一的模块加载方法
//     // Database = loadModule("better-sqlite3");
    
//     if (Database) {
//       console.log("✓ better-sqlite3 loaded successfully in main process");
//     } else {
//       console.error("✗ Failed to load better-sqlite3 in main process");
//     }
    
//     return Database;
// };

// 初始化数据库
export const initializeDatabase = () => {
    try {
        if (db) return; // 已经初始化过了
        

        const appRoot = process.cwd();
        cacheDir = path.join(appRoot, ".cache");
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        dbPath = path.join(cacheDir, "photos.db");
        console.log(`Initializing database at: ${dbPath}`);
        
        
        // Initialize thumbnail directory
        thumbsDir = path.join(cacheDir, ".thumbs");
        if (!fs.existsSync(thumbsDir)) {
            fs.mkdirSync(thumbsDir, { recursive: true });
        }
        
        // Database = loadBetterSqlite3();
        if (!Database) {
          console.error(
            "✗ Failed to load better-sqlite3, database operations will not be available",
          );
          return;
        }
        db = new Database(dbPath);

        console.log("✓ Database initialized successfully in main process");
    } catch (error: any) {
        console.error(`✗ Failed to initialize database in main process: ${error.message}`);
    }
};

// 注册 IPC 监听器
export const addDatabaseEventListeners = () => {
    try {
        // 初始化数据库
        initializeDatabase();
        
        if (!db) {
            console.warn("⚠ Database not available, IPC handlers will return null");
        }
        
        // 处理 SQL 执行操作
        ipcMain.handle("db-run", (_event, sql: string, params: any) => {
            try {
                if (!db) return null;
                return db.prepare(sql).run(params);
            } catch (error: any) {
                console.error(`✗ Database run error: ${error.message}`);
                throw error;
            }
        });
        
        // 处理单行查询
        ipcMain.handle("db-get", (_event, sql: string, params: any) => {
            try {
                if (!db) return null;
                return db.prepare(sql).get(params);
            } catch (error: any) {
                console.error(`✗ Database get error: ${error.message}`);
                throw error;
            }
        });
        
        // 处理多行查询
        ipcMain.handle("db-all", (_event, sql: string, params: any) => {
            try {
                if (!db) return null;
                return db.prepare(sql).all(params);
            } catch (error: any) {
                console.error(`✗ Database all error: ${error.message}`);
                throw error;
            }
        });
        
        // 处理多条 SQL 语句执行
        ipcMain.handle("db-exec", (_event, sql: string) => {
            try {
                if (!db) return null;
                return db.exec(sql);
            } catch (error: any) {
                console.error(`✗ Database exec error: ${error.message}`);
                throw error;
            }
        });
        
        // 获取数据库路径
        ipcMain.handle("db-get-path", () => dbPath);
        
        // 获取缩略图目录
        ipcMain.handle("db-get-thumbs-path", () => thumbsDir);
        
        console.log("✓ Database IPC listeners registered");
    } catch (error: any) {
        console.error(`✗ Failed to register database IPC listeners: ${error.message}`);
    }
};

// 关闭数据库
export const closeDatabase = () => {
    try {
        if (db) {
            db.close();
            db = null;
            console.log("✓ Database closed");
        }
    } catch (error: any) {
        console.error(`✗ Failed to close database: ${error.message}`);
    }
};
