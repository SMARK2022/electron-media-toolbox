declare global {
    interface Window {
      ElectronDB: {
        run: (sql: string, params: any) => any;
        get: (sql: string, params: any) => any;
        all: (sql: string, params: any) => any;
        exec: (sql: string) => any;
        getDbPath: () => string;
      };
      ElectronAPI: {
        runCommand: (command: string, cwd?: string) => Promise<void>;
        getThumbsCacheDir: () => string;
        // Add other methods and properties as needed
      };
    }
}

export {};