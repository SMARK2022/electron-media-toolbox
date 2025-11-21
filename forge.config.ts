import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerWix } from "@electron-forge/maker-wix";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

import * as path from "path";
import {
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
  existsSync,
  promises as fsp,
} from "node:fs";
import { normalize, join } from "node:path";

// flora-colossus：扫描 native 模块依赖
import { Walker, DepType, type Module } from "flora-colossus";
// MakerWix 使用的 MSICreator 类型（只做类型标注）
import type { MSICreator } from "electron-wix-msi";

// ================== 原生依赖配置 ==================

export const EXTERNAL_DEPENDENCIES = ["better-sqlite3", "exif-parser"];
let nativeModuleDependenciesToPackage: string[] = [];

type CopyClass<T> = {
  [P in keyof T]: T[P];
};

type CustomWalker = CopyClass<Walker> & {
  modules: Module[];
  walkDependenciesForModule: (
    moduleRoot: string,
    depType: DepType,
  ) => Promise<void>;
};

// 应用图标
const appIcon = path.resolve(__dirname, "assets", "app.ico");

// ================== Python 后端 exe 资源配置 ==================

// 这里假定你已经在项目根目录下的 python/out/web_api.exe
const pythonExeSource = path.resolve(__dirname, "python", "out", "web_api.exe");

// extraResource 列表：如果 exe 存在，就打包；否则只给个 warning
const extraResources: { from: string; to: string }[] = [];

if (existsSync(pythonExeSource)) {
  extraResources.push({
    from: pythonExeSource,
    // 最终在打包结果中的路径：<resources>/python/out/web_api.exe
    to: "python/out/web_api.exe",
  });
  console.log(
    "[forge-config] ✓ Found python backend exe, will bundle:",
    pythonExeSource,
  );
} else {
  console.warn(
    "[forge-config] ⚠ web_api.exe not found at python/out/web_api.exe; backend exe will NOT be bundled.",
  );
}

// ================== 工具函数：列出目录并清理空目录 ==================

type ItemInfo = {
  path: string;
  type: "directory" | "file";
  empty: boolean;
};

function getItemsFromFolder(
  folderPath: string,
  totalCollection: ItemInfo[] = [],
): ItemInfo[] {
  try {
    const normalizedPath = normalize(folderPath);
    const childItems = readdirSync(normalizedPath);
    const stats = statSync(normalizedPath);

    if (stats.isDirectory()) {
      totalCollection.push({
        path: normalizedPath,
        type: "directory",
        empty: childItems.length === 0,
      });
    }

    for (const child of childItems) {
      const childPath = join(normalizedPath, child);
      const childStats = statSync(childPath);
      if (childStats.isDirectory()) {
        getItemsFromFolder(childPath, totalCollection);
      } else {
        totalCollection.push({
          path: childPath,
          type: "file",
          empty: false,
        });
      }
    }
  } catch {
    // ignore
  }
  return totalCollection;
}

// ================== Forge 配置 ==================

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    prune: true,
    icon: appIcon,

    // 把 python 后端 exe 作为资源文件打进安装目录（resources/python/out/web_api.exe）
    extraResource: extraResources,

    // 只保留必要文件 + 图标 + 选中的 node_modules（大幅减小体积）
    ignore: (file: string) => {
      const filePath = file.toLowerCase();
      const KEEP_FILE = {
        keep: false,
        log: true,
      };

      // 根目录本身
      if (filePath === "") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/package.json")
        KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/node_modules")
        KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/.vite") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath.startsWith("/.vite/"))
        KEEP_FILE.keep = true;

      // 图标 / 资源
      if (!KEEP_FILE.keep && filePath === "/app.ico") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/assets") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath.startsWith("/assets/"))
        KEEP_FILE.keep = true;

      // 允许保留 python/out/web_api.exe 的源码路径（可选：方便 dev 调试时本地也能运行）
      if (!KEEP_FILE.keep && filePath === "/python") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/python/out") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/python/out/web_api.exe")
        KEEP_FILE.keep = true;

      // node_modules：只保留 nativeModuleDependenciesToPackage 中的模块
      if (!KEEP_FILE.keep && filePath.startsWith("/node_modules/")) {
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

      // 其它全部忽略
      return true;
    },
  } as any,

  rebuildConfig: {},

  makers: [
    // ----------------- Windows EXE：Squirrel 一键安装 -----------------
    new MakerSquirrel({
      name: "electron_media_toolbox",
      setupIcon: appIcon,
      // 不生成 Squirrel 自带 msi，避免和 WiX 冲突
      noMsi: true,
    }),

    // ----------------- Windows MSI：WiX 安装包 -----------------
    new MakerWix({
      name: "Electron Media Toolbox",
      manufacturer: "SMARK",
      description: "Electron Forge with shadcn-ui (Vite + Typescript)",
      exe: "Electron Media Toolbox.exe",
      programFilesFolderName: "Electron Media Toolbox",
      shortcutFolderName: "Electron Media Toolbox",

      // 安装器语言：中文
      language: 2052, // zh-CN
      cultures: "zh-CN",

      // 固定 UpgradeCode，用于覆盖安装（不要改）
      upgradeCode: "c5f77e4e-5b1f-4a32-8b3b-7aef8bd0fb75",
      icon: appIcon,

      // 按机器安装，默认 Program Files
      defaultInstallMode: "perMachine",

      // 允许用户选择安装目录（可以改到 D 盘等）
      ui: {
        chooseDirectory: true,
      },

      /**
       * WiX: 在 APPLICATIONROOTDIRECTORY 下插入一个 Component，
       * 给安装目录设置 Users 组 GenericAll（完全控制），
       * 并在 MainApplication Feature 下加 ComponentRef。
       * 这样即使安装在 C:\Program Files (x86)，普通用户也可以写入 .cache。
       */
      beforeCreate: async (msiCreator: MSICreator) => {
        const originalCreate = msiCreator.create.bind(msiCreator);

        msiCreator.create = async () => {
          const result = await originalCreate();

          try {
            const wxsPath = msiCreator.wxsFile;
            let wxs = await fsp.readFile(wxsPath, "utf8");

            const hasComponent = wxs.includes(
              'Component Id="AppFolderPermissions"',
            );
            const hasComponentRef = wxs.includes(
              'ComponentRef Id="AppFolderPermissions"',
            );

            // 1) 在 APPLICATIONROOTDIRECTORY 下插入权限 Component
            if (!hasComponent) {
              const appDirMarker = '<Directory Id="APPLICATIONROOTDIRECTORY"';
              const appDirIndex = wxs.indexOf(appDirMarker);

              if (appDirIndex !== -1) {
                const insertPos = wxs.indexOf(">", appDirIndex) + 1;

                // 固定 GUID，不能用 "*"
                const permissionComponent = `
        <Component Id="AppFolderPermissions" Guid="{D4C8F400-8C4A-4C28-9A3E-ABCDEF123456}">
          <CreateFolder>
            <Permission User="Users" GenericAll="yes" />
          </CreateFolder>
        </Component>`;

                wxs =
                  wxs.slice(0, insertPos) +
                  permissionComponent +
                  wxs.slice(insertPos);
              } else {
                console.warn(
                  "[maker-wix] APPLICATIONROOTDIRECTORY not found in .wxs, cannot inject AppFolderPermissions component.",
                );
              }
            } else {
              console.log(
                "[maker-wix] AppFolderPermissions component already exists, skip component injection.",
              );
            }

            // 2) 在 MainApplication Feature 中增加 ComponentRef
            if (!hasComponentRef) {
              const featureMarker = '<Feature Id="MainApplication"';
              const featureIndex = wxs.indexOf(featureMarker);
              if (featureIndex !== -1) {
                const featureOpenTagEnd = wxs.indexOf(">", featureIndex) + 1;
                const componentRefXml =
                  '\n      <ComponentRef Id="AppFolderPermissions" />';

                wxs =
                  wxs.slice(0, featureOpenTagEnd) +
                  componentRefXml +
                  wxs.slice(featureOpenTagEnd);
              } else {
                console.warn(
                  "[maker-wix] Feature MainApplication not found, cannot add ComponentRef for AppFolderPermissions.",
                );
              }
            } else {
              console.log(
                "[maker-wix] ComponentRef for AppFolderPermissions already exists, skip ComponentRef injection.",
              );
            }

            await fsp.writeFile(wxsPath, wxs, "utf8");
            console.log(
              "[maker-wix] Successfully patched .wxs with AppFolderPermissions (Users: GenericAll).",
            );
          } catch (err) {
            console.warn(
              "[maker-wix] Failed to patch .wxs for folder permissions:",
              err,
            );
          }

          return result;
        };
      },
    }),

    // ----------------- macOS：ZIP -----------------
    new MakerZIP({}, ["darwin"]),

    // ----------------- Linux：deb / rpm -----------------
    new MakerRpm({}),
    new MakerDeb({}),
  ],

  plugins: [
    new VitePlugin({
      build: [
        {
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
    new AutoUnpackNativesPlugin({}),
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
    // -------- 打包前：收集需要打进包的 native 依赖 --------
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
                .filter(
                  (dep) => (dep.nativeModuleType as number) === DepType.PROD,
                )
                .map((dep) => dep.name.split("/")[0])
                .forEach((name) => foundModules.add(name));
            } catch (error) {
              console.warn(
                `⚠ Failed to walk dependencies for ${external}:`,
                error,
              );
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

    // -------- 打包后：裁剪语言包 / LICENSE 等，清理空目录 --------
    postPackage: async (_forgeConfig, packageResult) => {
      const { outputPaths, platform, arch } = packageResult;

      console.log(
        `[hook:postPackage] optimizing ${platform}/${arch}, outputs:`,
        outputPaths,
      );

      for (const outputPath of outputPaths) {
        console.log(`  [postPackage] optimize path: ${outputPath}`);

        try {
          // 1) 只保留 zh-CN + en-US 语言文件
          const localesDir = path.join(outputPath, "locales");
          try {
            const keepLocales = new Set(["zh-CN", "en-US"]);
            const localeFiles = readdirSync(localesDir);

            for (const file of localeFiles) {
              if (!file.endsWith(".pak")) continue;
              const base = file.replace(/\.pak$/, "");
              if (keepLocales.has(base)) continue;

              const full = path.join(localesDir, file);
              unlinkSync(full);
              console.log(`    ✂ removed locale: ${file}`);
            }
          } catch (err) {
            console.warn(
              "    [postPackage] skip locales trimming (maybe no locales dir):",
              err,
            );
          }

          // 2) 删掉超大的 Chromium 版权文件（注意：对外发布时建议保留）
          const maybeRemove = ["LICENSES.chromium.html"];
          for (const name of maybeRemove) {
            const full = path.join(outputPath, name);
            try {
              unlinkSync(full);
              console.log(`    ✂ removed file: ${name}`);
            } catch {
              // ignore
            }
          }

          // 3) 清理删完后留下的空目录（可选）
          const items = getItemsFromFolder(outputPath) ?? [];
          for (const item of items) {
            if (!item.empty || item.type !== "directory") continue;
            const dirPath = normalize(item.path);
            try {
              const children = readdirSync(dirPath);
              if (children.length === 0) {
                rmdirSync(dirPath);
                // console.log(`    ✂ removed empty dir: ${dirPath}`);
              }
            } catch {
              // ignore
            }
          }
        } catch (err) {
          console.warn("[postPackage] optimize error:", err);
        }
      }
    },
  },
};

export default config;
