// -------- 全局 Window 类型声明（如果工程里已有可忽略重复） --------
// IPC 桥接层的返回值跨越主进程↔渲染进程序列化边界，TS 无法精确表达，
// 此处 any 是刻意的边界类型——改 unknown 会导致 db.ts 的 Promise<Photo[]> 等下游连锁报错
declare global {
  interface Window {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ElectronDB: {
      // params 既可能是单个对象（如 Photo），也可能是数组，用 unknown 兼容两种调用方式
      run(sql: string, params: unknown): Promise<any>;
      get(sql: string, params: unknown): Promise<any>;
      all(sql: string, params: unknown): Promise<any[]>;
      exec(sql: string): Promise<any>;
      getDbPath(): Promise<string>;
    };
    ElectronAPI: {
      platform: string;
      readFile(file: string): Promise<{ success: boolean; content: string }>;
      readClipboard(): Promise<string>;
      getThumbsCacheDir(): Promise<string>;
      runCommand(cmdStr: string, cmdPath?: string): Promise<string>;
      getPathForFile?(file: File): string;
      getPhotoMetadata(filePath: string): Promise<any>;
      // 跨平台文件操作（替代旧 runCommand Windows cmd 方案，主进程用 fs API）
      createFolder(folderPath: string): Promise<{ success: boolean }>;
      copyFile(src: string, dest: string): Promise<{ success: boolean }>;
      folderExists(folderPath: string): Promise<boolean>;
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }
}

export {};
