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
import { readdirSync, rmdirSync, statSync, promises as fsp } from "node:fs";
import { normalize, join } from "node:path";

// flora-colossus，用来找 native 模块依赖
import { Walker, DepType, type Module } from "flora-colossus";

// MakerWix 对应的底层 MSICreator 类型（仅类型标注）
import type { MSICreator } from "electron-wix-msi";

// 需要打包的外部依赖（原生模块）
export const EXTERNAL_DEPENDENCIES = ["better-sqlite3", "exif-parser"];

// 存储需要打包的原生模块及其依赖
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

// 应用图标路径
const appIcon = path.resolve(__dirname, "assets", "app.ico");

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    prune: true,
    icon: appIcon,
    // 只保留必要文件 + 图标 + 被选中的 node_modules
    ignore: (file: string) => {
      const filePath = file.toLowerCase();
      const KEEP_FILE = {
        keep: false,
        log: true,
      };

      // 这些必须保留
      if (filePath === "") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/package.json")
        KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/node_modules")
        KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/.vite") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath.startsWith("/.vite/"))
        KEEP_FILE.keep = true;

      // 根目录或 assets 下的图标
      if (!KEEP_FILE.keep && filePath === "/app.ico") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath === "/assets") KEEP_FILE.keep = true;
      if (!KEEP_FILE.keep && filePath.startsWith("/assets/"))
        KEEP_FILE.keep = true;

      // node_modules：只保留 nativeModuleDependenciesToPackage
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
    // Windows EXE：Squirrel 一键安装版
    new MakerSquirrel({
      name: "electron_media_toolbox",
      // 不写也可以，forge 会用 package.json 里的字段，这里显式一下方便以后改
      setupIcon: appIcon,
      // 只生成 EXE，不生成它自带的 msi，避免和 WiX 冲突
      noMsi: true,
    }),

    // Windows：WiX MSI 安装包（带 Users 完全控制权限）
    new MakerWix({
      name: "Electron Media Toolbox",
      manufacturer: "SMARK",
      description: "Electron Forge with shadcn-ui (Vite + Typescript)",
      exe: "Electron Media Toolbox.exe",
      programFilesFolderName: "Electron Media Toolbox",
      shortcutFolderName: "Electron Media Toolbox",

      // MSI 产品语言：2052 = zh-CN
      language: 2052,
      // WiX UI 字符串区域：强制使用 zh-CN 资源

      // 固定 UpgradeCode，用于版本覆盖安装（不要改）
      upgradeCode: "c5f77e4e-5b1f-4a32-8b3b-7aef8bd0fb75",
      icon: appIcon,

      // 明确按机器安装，默认 Program Files
      defaultInstallMode: "perMachine",

      // 允许用户在安装向导里选择安装目录（可以改到 D 盘等）
      ui: {
        chooseDirectory: true,
      },

      /**
       * 关键：在调用 msiCreator.create() 之后，patch .wxs：
       *  1) 在 APPLICATIONROOTDIRECTORY 下新增一个 Component，
       *     给安装目录设置 Users 组 GenericAll（完全控制）。
       *  2) 在 MainApplication Feature 下新增 ComponentRef。
       */
      beforeCreate: async (msiCreator: MSICreator) => {
        const originalCreate = msiCreator.create.bind(msiCreator);

        msiCreator.create = async () => {
          const result = await originalCreate();

          try {
            const wxsPath = msiCreator.wxsFile;
            let wxs = await fsp.readFile(wxsPath, "utf8");

            // 如果已经打过补丁，就不要重复插入
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

                // 注意：这里使用一个固定 GUID，不能用 "*"
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

    // macOS：ZIP
    new MakerZIP({}, ["darwin"]),

    // Linux：deb / rpm
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
    // 打包前：收集原生依赖
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
                // '@scope/package' => 只保留第一段
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

    // 打包后：清理空目录
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
