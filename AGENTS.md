# AGENTS.md

本文件向 AI 协作助手（Claude / opencode / Cursor 等）说明本仓库的关键约定与校验命令。

## 项目概览

SMARK Media Tools — 基于 Electron + FastAPI(Nuitka 编译) + ONNX Runtime(DirectML) 的 Windows 桌面照片选片工具。

- 仓库：https://github.com/SMARK2022/electron-media-toolbox
- 平台：**Windows-only**（后端依赖 `onnxruntime-directml` + `comtypes`，macOS/Linux 仅能跑前端壳，`src/main.ts:103` 已显式跳过非 Windows 后端启动）
- 版本：见 `package.json` 的 `version`，发版 tag 形如 `v2.1.1`，`GithubVersionChecker.tsx` 轮询 Releases

## 技术栈分层

| 层          | 位置                                 | 技术                                                                                       |
| ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| 主进程      | `src/main.ts`, `src/helpers/ipc/`    | Electron 39 + TypeScript(strict)                                                           |
| 渲染进程    | `src/pages/`, `src/components/`      | React 19 + Vite + TanStack Router/Query + Zustand + shadcn/ui + Tailwind v4                |
| Python 后端 | `python/web_api.py`, `python/utils/` | FastAPI + uvicorn，Nuitka 编译为 `python/out/web_api.exe`                                  |
| 推理        | `python/checkpoint/*.onnx`           | onnxruntime-directml（lar_iqa / det_10g / ocec_l / 2d106det_batch，共 ~105MB，走 Git LFS） |
| 打包        | `forge.config.ts`                    | Electron Forge 7（Squirrel `.exe` + WiX `.msi`）                                           |
| Native      | `better-sqlite3`                     | 更换 Electron 版本后必须 `npm run rebuild`                                                 |

## 必跑校验命令

修改代码后按需运行：

```bash
npm run lint          # eslint .（已配置 eslint.config.mjs）
npx tsc --noEmit      # TypeScript 类型检查（strict）
npm run format        # prettier --check .
npm run test          # vitest 单元测试 (src/tests/unit, jsdom, 全局 API)
npm run test:e2e      # Playwright + Electron E2E（需先 npm run package 产物 + 后端 127.0.0.1:8000）
npm run test:all      # vitest + playwright
npm run rebuild       # 更换 better-sqlite3 / Electron 版本后必须运行
```

## 测试分层

- **单元测试**：`src/tests/unit/*.test.{ts,tsx}`，vitest 全局 API（无需 import describe/it/expect），jsdom 环境，不依赖后端/native，跨平台安全
- **E2E 测试**：`src/tests/e2e/*.spec.ts`，Playwright + `_electron as electron`，需先 `npm run package` 产物，依赖后端 `localhost:8000`
- E2E 测试路径已相对化（`src/tests/e2e/helpers/electronApp.ts`），可用环境变量覆盖：
  - `E2E_TEST_IMAGES_DIR`：测试图片目录（默认 `<repo>/dev/imgs_to test`，CI 指向 `src/tests/e2e/fixtures/images`）
  - `E2E_EXPORT_DIR`：导出测试目录（默认 `<repo>/dev/test_export`）

## 打包流程

开发本地一键发布：`npm run publish`（= `zip-python.cjs` + `electron-forge make`）。

完整构建链（与 `.github/workflows/release.yml` 一致）：

1. Nuitka 编译 `python/web_api.py` → `python/out/web_api.exe`（`npm run python:make`，需 conda env `nuitka`，见 `scripts/python-make.bat`）
2. `forge.config.ts` 通过 `extraResource` 把 `web_api.exe` 打入 `resources/`（`webpack` ignore 规则已排除 `python/` 源码）
3. `electron-forge make --platform=win32` 产出 `out/make/squirrel.windows/x64/*.exe` + `out/make/wix/x64/*.msi`
4. `prePackage` hook 用 flora-colossus 自动收集 `better-sqlite3` 及其 native 子树；`postPackage` hook 裁剪 locales（仅 zh-CN/en-US）

## CI/CD

| Workflow                        | 触发                      | 作用                                                                                                                  |
| ------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`      | push/PR to master         | lint + typecheck + format + vitest（ubuntu + windows 矩阵）                                                           |
| `.github/workflows/release.yml` | push master（paths 过滤） | 构建 web_api.exe + Forge make → 上传到 `v{version}` tag 的 GitHub Release，同版本多次 push 用 `--clobber` 覆盖 assets |
| `.github/workflows/e2e.yml`     | PR / 手动                 | Playwright E2E（Windows，需 fixture 图）                                                                              |

Composite actions：

- `.github/actions/setup-node-app`：setup-node 20 + npm ci + 可选 rebuild
- `.github/actions/build-python-win`：Miniconda(nuitka env) + pip install + Nuitka 编译

## 代码签名

当前无 EV 证书，安装包未签名，会被 Windows SmartScreen 拦截（属预期行为）。用户需点"仍要运行"。后续若有证书，在 `release.yml` 的 `build-windows` job 增加 `signtool sign` 步骤。

## 大文件 / Git LFS

- `python/checkpoint/*.onnx`（共 ~105MB）走 Git LFS（见 `.gitattributes`）
- clone 后需 `git lfs install` + `git lfs pull`，否则 onnx 是指针文件
- `*.zip` 同样走 LFS
