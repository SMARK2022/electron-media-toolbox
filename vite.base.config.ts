import { builtinModules } from "node:module";
import type { AddressInfo } from "node:net";
import type { ConfigEnv, Plugin, UserConfig, ViteDevServer } from "vite";
import pkg from "./package.json";

interface VitePluginRuntimeKeys {
  VITE_DEV_SERVER_URL: string;
  VITE_NAME: string;
}

// declare global 扩展 NodeJS.Process 是 Vite 插件注入运行时键的必要手段，
// no-namespace 规则对 declare global 中的 namespace 扩展不适用，用块级豁免
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace NodeJS {
    interface Process {
      viteDevServers?: Record<string, ViteDevServer>;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

export const builtins = [
  "electron",
  ...builtinModules.map((m) => [m, `node:${m}`]).flat(),
];

// 需要外部化的依赖（这些将在运行时加载，不会被捆绑）
// better-sqlite3 和 exif-parser 需要在这里标记为外部，这样 Vite 不会尝试捆绑它们
const packaged = [
  "exif-parser",
  "better-sqlite3",
  "bindings",
  "prebuild-install",
  "file-uri-to-path",
];

export const external = [
  ...builtins,
  ...Object.keys(
    "dependencies" in pkg ? (pkg.dependencies as Record<string, unknown>) : {},
  ).filter((dep) => !packaged.includes(dep)),
  ...packaged, // 将原生模块标记为外部
];

export function getBuildConfig(env: ConfigEnv): UserConfig {
  const { mode, command } = env;

  return {
    mode,
    build: {
      // Prevent multiple builds from interfering with each other.
      emptyOutDir: false,
      // 🚧 Multiple builds may conflict.
      outDir: ".vite/build",
      watch: command === "serve" ? {} : null,
      minify: command === "build",
    },
    clearScreen: false,
  };
}

export function getDefineKeys(
  names: string[],
): Record<string, VitePluginRuntimeKeys> {
  const define: Record<string, VitePluginRuntimeKeys> = {};

  return names.reduce((acc, name) => {
    const NAME = name.toUpperCase();
    const keys: VitePluginRuntimeKeys = {
      VITE_DEV_SERVER_URL: `${NAME}_VITE_DEV_SERVER_URL`,
      VITE_NAME: `${NAME}_VITE_NAME`,
    };

    return { ...acc, [name]: keys };
  }, define);
}

// Vite define 值为字符串化结果（JSON.stringify），用 Record<string, string | undefined> 代替 any
export function getBuildDefine(
  env: ConfigEnv,
): Record<string, string | undefined> {
  // ConfigEnv 的 forgeConfig 字段类型不完整，用最小结构断言代替 any
  const { command, forgeConfig } = env as {
    command: string;
    forgeConfig: { renderer: { name: string | null }[] };
  };
  const names: string[] = forgeConfig.renderer
    .filter(({ name }: { name: string | null }) => name != null)
    .map(({ name }: { name: string }) => name);
  const defineKeys = getDefineKeys(names);
  const define = Object.entries(defineKeys).reduce(
    (acc, [name, keys]) => {
      const { VITE_DEV_SERVER_URL, VITE_NAME } = keys;
      const def = {
        [VITE_DEV_SERVER_URL]:
          command === "serve"
            ? JSON.stringify(process.env[VITE_DEV_SERVER_URL])
            : undefined,
        [VITE_NAME]: JSON.stringify(name),
      };
      return { ...acc, ...def };
    },
    {} as Record<string, string | undefined>,
  );

  return define;
}

export function pluginExposeRenderer(name: string): Plugin {
  const { VITE_DEV_SERVER_URL } = getDefineKeys([name])[name];

  return {
    name: "@electron-forge/plugin-vite:expose-renderer",
    configureServer(server: ViteDevServer) {
      process.viteDevServers ??= {};
      // Expose server for preload scripts hot reload.
      process.viteDevServers[name] = server;

      server.httpServer?.once("listening", () => {
        const addressInfo = server.httpServer!.address() as AddressInfo;
        // Expose env constant for main process use.
        process.env[VITE_DEV_SERVER_URL] =
          `http://localhost:${addressInfo?.port}`;
      });
    },
  };
}

export function pluginHotRestart(command: "reload" | "restart"): Plugin {
  return {
    name: "@electron-forge/plugin-vite:hot-restart",
    closeBundle() {
      if (command === "reload") {
        for (const server of Object.values(process.viteDevServers ?? {})) {
          // Preload scripts hot reload.
          server.ws.send({ type: "full-reload" });
        }
      } else {
        // Main process hot restart.
        // https://github.com/electron/forge/blob/v7.2.0/packages/api/core/src/api/start.ts#L216-L223
        process.stdin.emit("data", "rs");
      }
    },
  };
}
