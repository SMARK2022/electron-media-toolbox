declare global {
    interface Window {
        ElectronDB: {
            run: (sql: string, params: any) => any;
            get: (sql: string, params: any) => any;
            all: (sql: string, params: any) => any;
            exec: (sql: string) => any;
            getDbPath: () => string;
            getThumbsPath: () => string;
        };
    }
}

export {}; 