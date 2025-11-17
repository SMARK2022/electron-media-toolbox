// -------- 全局 Window 类型声明（如果工程里已有可忽略重复） --------
declare global {
  interface Window {
    ElectronDB?: {
      run(sql: string, params: any): Promise<any>;
      get(sql: string, params: any): Promise<any>;
      all(sql: string, params: any): Promise<any[]>;
      exec(sql: string): Promise<any>;
      getDbPath(): Promise<string>;
    };
    ElectronAPI?: {
      readFile(file: string): Promise<{ success: boolean; content: string }>;
      readClipboard(): Promise<string>;
      getThumbsCacheDir(): Promise<string>;
      runCommand(cmdStr: string, cmdPath: string): Promise<string>;
      getPathForFile?(file: File): string;
    };
  }
}

export {};
