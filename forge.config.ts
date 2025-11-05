import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import * as path from "path";
import { readdirSync, rmdirSync, statSync } from "node:fs";
import { normalize, join } from "node:path";

// 使用 flora-colossus 来处理依赖树（它已经是 electron-packager 的依赖，不需要另外安装）
import { Walker, DepType, type Module } from "flora-colossus";

// 定义需要打包的外部依赖
export const EXTERNAL_DEPENDENCIES = ["better-sqlite3", "exif-parser"];

// 存储需要打包的原生模块及其依赖
let nativeModuleDependenciesToPackage: string[] = [];

type CopyClass<T> = {
  [P in keyof T]: T[P];
};

type CustomWalker = CopyClass<Walker> & {
  modules: Module[];
  walkDependenciesForModule: (moduleRoot: string, depType: DepType) => Promise<void>;
};

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // 忽略规则：只保留需要的原生模块
    ignore: (file: string) => {
      const filePath = file.toLowerCase();
      const KEEP_FILE = {
        keep: false,
        log: true,
      };

      // 必须返回 false 表示保留，否则什么都不会被打包
      if (filePath === "") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/package.json") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/node_modules") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/.vite") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath.startsWith("/.vite/")) KEEP_FILE.keep = true;

      // 处理 node_modules 中的文件
      if (!KEEP_FILE.keep && filePath.startsWith("/node_modules/")) {
        // 检查是否是需要的依赖
        for (const dep of nativeModuleDependenciesToPackage) {
          if (
            filePath === `/node_modules/${dep}/` ||
            filePath === `/node_modules/${dep}`
          ) {
            KEEP_FILE.keep = true;
            break;
          }
          if (filePath === `/node_modules/${dep}/package.json`) {
            KEEP_FILE.keep = true;
            break;
          }
          if (filePath.startsWith(`/node_modules/${dep}/`)) {
            KEEP_FILE.keep = true;
            KEEP_FILE.log = false;
            break;
          }
        }
      }

      if (KEEP_FILE.keep) {
        if (KEEP_FILE.log) console.log("✓ Keeping:", file);
        return false;
      }
      return true;
    },
  } as any,
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),
    // 自动解包原生模块
    new AutoUnpackNativesPlugin({}),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    // 打包前收集所有依赖
    prePackage: async () => {
      const projectRoot = normalize(__dirname);
      const getExternalNestedDependencies = async (
        nodeModuleNames: string[],
        includeNestedDeps = true,
      ) => {
        const foundModules = new Set(nodeModuleNames);
        if (includeNestedDeps) {
          for (const external of nodeModuleNames) {
            const moduleRoot = join(projectRoot, "node_modules", external);
            try {
              const walker = new Walker(moduleRoot) as unknown as CustomWalker;
              walker.modules = [];
              await walker.walkDependenciesForModule(moduleRoot, DepType.PROD);
              walker.modules
                .filter((dep) => (dep.nativeModuleType as number) === DepType.PROD)
                // 对于 '@scope/package' 形式的包，取第一部分
                .map((dep) => dep.name.split("/")[0])
                .forEach((name) => foundModules.add(name));
            } catch (error) {
              console.warn(`⚠ Failed to walk dependencies for ${external}:`, error);
            }
          }
        }
        return foundModules;
      };

      const nativeModuleDependencies = await getExternalNestedDependencies(
        EXTERNAL_DEPENDENCIES,
      );
      nativeModuleDependenciesToPackage = Array.from(nativeModuleDependencies);
      console.log(
        "✓ Dependencies to package:",
        nativeModuleDependenciesToPackage.join(", "),
      );
    },

    // 打包后清理空目录
    packageAfterPrune: async (_forgeConfig, buildPath) => {
      function getItemsFromFolder(
        folderPath: string,
        totalCollection: {
          path: string;
          type: "directory" | "file";
          empty: boolean;
        }[] = [],
      ) {
        try {
          const normalizedPath = normalize(folderPath);
          const childItems = readdirSync(normalizedPath);
          const getItemStats = statSync(normalizedPath);
          if (getItemStats.isDirectory()) {
            totalCollection.push({
              path: normalizedPath,
              type: "directory",
              empty: childItems.length === 0,
            });
          }
          childItems.forEach((childItem) => {
            const childItemNormalizedPath = join(normalizedPath, childItem);
            const childItemStats = statSync(childItemNormalizedPath);
            if (childItemStats.isDirectory()) {
              getItemsFromFolder(childItemNormalizedPath, totalCollection);
            } else {
              totalCollection.push({
                path: childItemNormalizedPath,
                type: "file",
                empty: false,
              });
            }
          });
        } catch {
          return;
        }
        return totalCollection;
      }

      const getItems = getItemsFromFolder(buildPath) ?? [];
      for (const item of getItems) {
        if (item.empty === true) {
          const pathToDelete = normalize(item.path);
          try {
            const stats = statSync(pathToDelete);
            if (!stats.isDirectory()) {
              continue;
            }
            const childItems = readdirSync(pathToDelete);
            if (childItems.length === 0) {
              rmdirSync(pathToDelete);
            }
          } catch {
            // 忽略错误
          }
        }
      }
    },
  },
};

export default config;
