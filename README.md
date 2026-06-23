<div align="center">
  <img src="assets/app.ico" alt="SMARK App Icon" height="80">
  <h1>SMARK Media Tools</h1>
  <p><b>基于 GPU/ONNX 加速的摄影后期选片与管理工具箱</b></p>

  <p>
    <a href="README_En.md">English</a> | <b>简体中文</b>
  </p>

  <p>
    <img src="https://img.shields.io/badge/version-2.1.2-blue" alt="Version">
    <img src="https://img.shields.io/badge/platform-Windows-0078D6" alt="Platform">
    <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License">
    <img src="https://img.shields.io/badge/backend-FastAPI%20%7C%20Nuitka-yellow" alt="Backend">
  </p>
</div>

---

## 📖 项目简介

**SMARK Media Tools** 是一款专为摄影爱好者设计的本地化媒体管理工具。针对连拍产生的海量废片与重复照片，本工具提供了一套高效的自动化整理方案：

1.  **智能分组**：通过 HSV 直方图相似度，自动将连拍序列或相似场景聚类。
2.  **美学评分**：集成 ZJU **LAR-IQA** 无参考图像质量评估算法（ONNX Runtime / DirectML 加速），自动筛选组内最佳照片。
3.  **一键导出**：快速标记保留/废弃，将精选照片导出至目标文件夹。

> **性能参考**：缩略图生成约 **3ms/帧**，质量评估推理约 **1s/帧** (取决于 GPU 性能)。

<div align="center">
  <img src="assets/gui.png" alt="SMARK Media Tools GUI" width="100%">
</div>

---

## ✨ 主要特性

- **⚡ 全链路加速**
  - **ONNX Runtime (DirectML)**：将 LAR-IQA 模型导出为 ONNX 格式，基于 DirectML 后端在 Windows 平台上统一支持 NVIDIA / AMD / 集成显卡及 CPU，加速推理的同时脱离笨重的 PyTorch 环境与 CUDA 依赖。
  - **Nuitka 编译**：Python 后端被编译为单一 `web_api.exe`，启动速度快，资源占用低。

- **🧠 自动化后端管理 (v2.1.0)**
  - Electron 主进程自动接管后端生命周期（启动/保活/关闭）。
  - 内置健康检查机制：启动前 10 秒自动探测后端状态，实时监控响应延迟。

- **📦 开箱即用**
  - 提供 Windows `.msi` 安装包，内含 Electron 前端、预编译后端及运行库。
  - **无需配置 Python 环境**，无需安装 CUDA 工具包（依赖已内置）。

- **🎨 现代化交互**
  - 基于 Shadcn UI + Tailwind CSS 构建，支持键盘快捷键操作。
  - 直观的“分组-详情”视图，支持单张照片的启用/弃用标记。

---

## 📥 安装与运行

### 1. 终端用户 (推荐)

请直接访问 [Releases](../../releases) 页面下载最新版本的安装包：

- 下载 **`Electron Media Toolbox.msi`**
- 双击安装即可，无需任何额外配置。

### 2. 开发者 (源码编译)

如需二次开发，请分别准备 Node.js 和 Python 环境。

```bash
# 1. 克隆仓库
git clone https://github.com/SMARK2022/electron-media-toolbox.git

# 2. 准备后端 (推荐使用 Conda/venv)
cd python
pip install -r requirements.txt
python web_api.py  # 启动后端服务

# 3. 启动前端 (在新的终端窗口)
cd ..
npm install
npm run start
````

> **注意**：开发模式下，Electron 将直接连接本地 Python 源码服务；构建生产版本时，系统会调用 Nuitka 将后端编译为 exe 并打包。

---

## 🛠️ 技术栈

| 模块             | 技术选型                          | 说明                                                                |
| :--------------- | :-------------------------------- | :------------------------------------------------------------------ |
| **UI / Desktop** | Electron, Vite, React, TypeScript | Shadcn UI + Tailwind CSS 界面构建                                   |
| **Backend**      | FastAPI, Uvicorn                  | 核心业务逻辑与文件 I/O                                              |
| **Compiler**     | **Nuitka**                        | 将 Python 编译为独立可执行文件 (`onefile`)                          |
| **AI Inference** | **ONNX Runtime (DirectML)**       | 运行 LAR-IQA 模型，统一支持 Windows 上的 NVIDIA/AMD/集成 GPU 与 CPU |
| **Packaging**    | Electron Forge, Wix Toolset       | 生成 Windows MSI 安装包                                             |

---

## 🗓️ 功能规划

* [x] **照片智能分组** (HSV 直方图)
* [x] **LAR-IQA 美学评分** (ONNX Runtime)
* [x] **后端独立编译与生命周期管理** (Nuitka + Auto-start)
* [x] **Windows MSI 安装包封装**
* [ ] 多维度排序指标 (人脸对焦清晰度、文件大小等)
* [ ] 视频文件的导入与切片支持

---

## 📝 更新日志

### v2.1.1 (2025-11-23)

* **推理后端迁移**：从 `onnxruntime-gpu` 切换为 `onnxruntime-directml`，在 Windows 平台上统一支持 NVIDIA / AMD / CPU，无需额外安装 CUDA/cuDNN。
* **兼容性优化**：完善 Nuitka onefile 退出流程与信号处理，避免强制终止导致临时解压目录无法清理。

### v2.1.0 (2025-11-22)

* **架构升级**：后端迁移至 ONNX Runtime，移除 PyTorch 依赖，体积大幅减小。
* **编译优化**：使用 Nuitka 编译后端，极大提升启动速度与稳定性。
* **体验改进**：新增后端健康探测与延迟显示，优化“关于”页面与版本检查器。

### v2.0.0 (2025-11-19)

* **正式发布**：推出 `.msi` 安装包，重构导入/导出流程，UI 全面升级。

---

## 📂 项目结构

```text
SMARKMediaTools
├── python/
│   ├── web_api.py             # FastAPI 后端源码
│   ├── out/web_api.exe        # Nuitka 编译产物
│   ├── checkpoint/            # ONNX 模型文件
│   └── utils/                 # 图像处理核心算法
├── src/
│   ├── main.ts                # Electron 主进程 (负责后端管理)
│   ├── renderer/pages/        # React 页面 (Home, Filter, etc.)
│   └── components/            # UI 组件
└── package.json
```

---

## 📄 许可证与致谢

本项目基于 **Apache License 2.0** 开源。

* **LAR-IQA**: [https://github.com/nasimjamshidi/LAR-IQA](https://github.com/nasimjamshidi/LAR-IQA)
* **UI Template**: [electron-shadcn](https://github.com/LuanRoger/electron-shadcn)

**作者**: [SMARK](https://github.com/SMARK2022) | 📧 [SMARK2019@outlook.com](mailto:SMARK2019@outlook.com)

