# <img src="assets/app.ico" alt="SMARK App Icon" height="32"> SMARK Media Tools

> A fast, GPU-accelerated photo curation toolbox for burst shots and large image collections.

## 项目简介 | Project Introduction

**SMARK Media Tools** 是一个面向摄影爱好者与重度图片用户的媒体工具箱，专注于图片的高效管理、分组与筛选。
**SMARK Media Tools** is a media toolbox designed for efficient management, grouping, and filtering of images.

![SMARK Media Tools GUI](assets/gui.png)

在实际拍摄中，用户常常会产生大量连拍照片，后期筛选过程费时费力、且难以保证主观挑选的一致性。
因此，本项目支持直接读取相机存储卡中的照片文件夹，通过 **HSV 直方图相似度进行分组**，再结合 **无参考 IQA 美学评分** 对组内照片进行排序，帮助用户快速挑选、删除或保留照片。完成筛选后，用户可一键将选中的照片复制导出到指定文件夹。

In real-world photography, users often end up with many burst shots that are hard to filter manually.
This toolbox reads photos directly from a camera storage folder, **groups them by HSV histogram similarity**, and **sorts within each group by no-reference IQA aesthetic score**, making it much easier to delete or keep photos. After curation, users can export selected photos to a target folder with one click.

我们的项目目前能够实现：

- **缩略图生成**：约 **3 ms / frame**
- **照片推理与质量评估**：约 **1 s / frame**

---

## 主要特性 | Key Features

- 🔍 **智能分组**：基于 HSV 直方图相似度自动按场景/连拍序列分组
- 🎨 **美学评分排序**：采用 ZJU LAR-IQA 无参考图像质量评估算法，对组内照片按质量排序
- ⚡ **GPU 加速**：基于 PyTorch + CUDA，支持显卡加速推理
- 🧩 **友好界面与流程**（自 v2.0.0 起大幅优化）：
  - 更清晰的导入流程与状态反馈
  - 更直观的筛选界面与预览面板
- 📦 **轻量打包与安装**（自 v2.0.0 起）：
  - 支持 **Windows `.msi` 安装包**
  - 精简 Electron 打包体积，减少冗余依赖

---

## 目前功能计划 | Current Feature Plan

| 功能                           | Feature                                               | Progress      | Info                                          |
| ------------------------------ | ----------------------------------------------------- | ------------- | --------------------------------------------- |
| 实现照片的分组                 | Grouping photos                                       | ✅ Done        | 24.10.08 — Judged by HSV similarity           |
| 添加显卡支持                   | Add GPU support                                       | ✅ Done        | 24.12.02 — Using PyTorch + CUDA               |
| 调用更先进的 IQA 模型          | Use advanced IQA model                                | ✅ Done        | 24.12.16 — Using ZJU LAR-IQA no-reference IQA |
| 配置项、支持页面切换与状态复原 | Configuration options, page switching & state restore | ⬜ In Progress | Basic UI structure ready                      |
| 实现多种指标排序               | Implement multi-criteria sorting                      | ⬜ Todo        | e.g. time, file size, face focus              |
| 实现视频的导入与切片保存       | Video import & frame slicing                          | ⬜ Todo        | Planned for future releases                   |

---

## 技术栈 | Tech Stack

- **Desktop / UI**
  - Electron + Vite + React + Shadcn UI
- **Backend / Engine**
  - Python + FastAPI / HTTP API
  - PyTorch + CUDA（GPU 加速 IQA 与分析）

---

## 项目结构 | Project Structure

```bash
📁 SMARKMediaTools
├── 📁python
│   ├── web_api.py
│   └── 📁utils
│       └── thumbnails.py
└── 📁src
    ├── 📁components
    │   ├── CustomSlider.tsx
    │   ├── ImagePreview.tsx
    │   └── PhotoGrid.tsx
    ├── 📁pages
    │   ├── AboutPage.tsx
    │   ├── HomePage.tsx
    │   └── 📁PhotoFilterPage
    │       └── PhotoFilterPage.tsx
    ├── App.tsx
    └── main.ts
````

---

## 安装与运行 | Installation & How to Run

### 1. 终端用户（推荐）| For End Users (Recommended)

在 Releases 页面下载最新版本（自 **v2.0.0** 起）：

* 下载并运行 **`SMARKMediaTools-2.0.0-setup.msi`**
* 按照安装向导完成安装
* 从开始菜单或桌面快捷方式启动 **SMARK Media Tools**

> Windows `.msi` 安装包已对打包体积进行精简，同时自动包含所需的 Electron 运行环境与前端资源。

### 2. 开发者模式 | For Developers (From Source)

1. 启动 Python 后端（FastAPI / Web API）
   Start the Python backend:

   ```bash
   python python/web_api.py
   ```

2. 启动前端 Electron 应用
   Start the frontend (Electron + Vite):

   ```bash
   npm install    # 首次运行时需要
   npm run start
   ```

---

## 作者 | Author

<table>
  <tr>
    <td><img src="src/assets/images/avatar.jpg" alt="SMARK's Avatar" width="100" height="100"></td>
    <td>
      <strong>作者:</strong> SMARK<br>
      <strong>Email:</strong> SMARK2019@outlook.com<br>
      <strong>GitHub:</strong> <a href="https://github.com/SMARK2022">https://github.com/SMARK2022</a>
    </td>
  </tr>
</table>

---

## 特别感谢 | Special Thanks

本项目基于
This project is based on:

* Electron + Shadcn 模板：[https://github.com/LuanRoger/electron-shadcn](https://github.com/LuanRoger/electron-shadcn)

本项目采用了
This project uses:

* 无参 IQA 算法：[https://github.com/nasimjamshidi/LAR-IQA](https://github.com/nasimjamshidi/LAR-IQA)

---

## 许可证 | License

此项目基于 **Apache License 2.0** 协议发布，详情请参见 `LICENSE` 文件。
This project is licensed under the **Apache License 2.0**. For details, please refer to the `LICENSE` file.

---

## 更新日志 | Changelog

### 🚀 2.0.0 — 2025.11.19

* 新增 **Windows `.msi` 安装包**，支持一键安装与卸载
* **大幅精简打包体积**，移除冗余依赖，优化 Electron 资源结构
* 全面优化 UI：

  * 导入页面与筛选页面重新设计，层级更清晰
  * 提升空状态、加载状态与错误状态的视觉反馈
* 重构照片导入流程：

  * 更稳定的文件夹检测逻辑
  * 更清晰的导入状态提示与进度反馈

---

### 🧪 1.x 系列（Alpha）摘要 | 1.x (Alpha) Summary

* **a1.5 — 2025.11.16**

  * 调整照片路径输入方式，支持自动检测文件夹路径
  * 优化若干交互细节，修复已知 bug

* **a1.4 — 2025.11.16**

  * 更新部分依赖项
  * 新增 GitHub Releases 版本检查器，可在「关于」页面检测更新

* **a1.3 — 2025.11.06**

  * 修正 electron-forge 与 Vite 打包导致的依赖缺失问题
  * 修复若干 bug，并发布首个 Electron 打包版 release

* **a1.2 — 2025.01.06**

  * 更新 `.vite` 缓存文件与 Vite 版本
  * 添加基础筛选功能（简易 Filter 模块）

* **a1.1 / a1.1 更新 — 2025.01.06–2024.12.23**

  * 设置全局语言翻译表（i18n），支持中英双语界面
  * 优化启动页与页面布局
  * 添加文件夹可用性检测功能

* **a1.0 — 2024.12.22**

  * 初始化项目，完成基本导入、分组与导出流程
  * 初步实现 HSV 分组与 IQA 排序逻辑
