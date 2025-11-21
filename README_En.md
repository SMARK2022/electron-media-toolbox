<div align="center">
  <img src="assets/app.ico" alt="SMARK App Icon" height="80">
  <h1>SMARK Media Tools</h1>
  <p><b>Fast, GPU/ONNX-Accelerated Photo Curation Toolbox</b></p>

  <p>
    <b>English</b> | <a href="README.md">简体中文</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/version-2.1.0-blue" alt="Version">
    <img src="https://img.shields.io/badge/platform-Windows-0078D6" alt="Platform">
    <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License">
    <img src="https://img.shields.io/badge/backend-FastAPI%20%7C%20Nuitka-yellow" alt="Backend">
  </p>
</div>

---

## 📖 Introduction

**SMARK Media Tools** is a desktop utility designed for photographers and power users to efficiently manage large image collections. It solves the problem of culling burst shots and duplicate photos through automation:

1.  **Smart Grouping**: Clusters photos by scene or burst sequence using HSV histogram similarity.
2.  **Aesthetic Ranking**: Sorts photos within groups using the **LAR-IQA** (No-Reference Image Quality Assessment) algorithm, accelerated by ONNX.
3.  **Quick Export**: Streamlines the selection process, allowing users to keep the best shots and export them with one click.

> **Performance**: ~3ms/frame for thumbnails, ~1s/frame for AI inference (GPU dependent).

<div align="center">
  <img src="assets/gui.png" alt="SMARK Media Tools GUI" width="100%">
</div>

---

## ✨ Key Features

- **⚡ Optimized Performance**
  - **ONNX Runtime**: Uses the LAR-IQA model in ONNX format (CUDA/TensorRT supported), eliminating the need for a heavy PyTorch environment.
  - **Nuitka Compilation**: The Python backend is compiled into a single standalone `web_api.exe`, ensuring fast startup and low overhead.

- **🧠 Self-Contained Backend (v2.1.0)**
  - The Electron main process automatically manages the backend lifecycle (start, monitor, kill).
  - Built-in health checks: Probes backend status within the first 10 seconds of launch and monitors latency.

- **📦 Ready to Use**
  - Distributed as a Windows `.msi` installer containing the Electron app, compiled backend, and necessary libraries.
  - **No Python configuration required**. No manual CUDA toolkit installation needed.

- **🎨 Modern UX**
  - Built with Shadcn UI + Tailwind CSS.
  - Intuitive "Group & Detail" view with keyboard shortcuts for flagging photos.

---

## 📥 Installation

### 1. For End Users (Recommended)

Download the latest installer from the [Releases](../../releases) page:

- Download **`SMARKMediaTools-x.x.x-setup.msi`**
- Run the installer. No extra configuration is needed.

### 2. For Developers (Source)

Requirements: Node.js and Python.

```bash
# 1. Clone the repository
git clone [https://github.com/SMARK2022/electron-media-toolbox.git](https://github.com/SMARK2022/electron-media-toolbox.git)

# 2. Setup Backend (Conda/venv recommended)
cd python
pip install -r requirements.txt
python web_api.py  # Start the API server

# 3. Start Frontend (In a new terminal)
cd ..
npm install
npm run start
````

> **Note**: In dev mode, Electron connects to your local Python source. In production, Nuitka compiles the backend into an executable which is bundled by Electron Forge.

-----

## 🛠️ Tech Stack

| Component        | Tech Choice                       | Description                                   |
| :--------------- | :-------------------------------- | :-------------------------------------------- |
| **UI / Desktop** | Electron, Vite, React, TypeScript | Frontend built with Shadcn UI & Tailwind      |
| **Backend**      | FastAPI, Uvicorn                  | Core logic and File I/O                       |
| **Compiler**     | **Nuitka**                        | Compiles Python to standalone EXE (`onefile`) |
| **AI Inference** | **ONNX Runtime**                  | LAR-IQA model execution (CPU/GPU)             |
| **Packaging**    | Electron Forge, Wix Toolset       | Windows MSI generation                        |

-----

## 🗓️ Roadmap

  - [x] **Photo Grouping** (HSV Histogram)
  - [x] **Aesthetic Scoring** (LAR-IQA via ONNX)
  - [x] **Backend Compilation & Lifecycle Management** (Nuitka)
  - [x] **Windows MSI Packaging**
  - [ ] Multi-criteria sorting (Face focus, file size, etc.)
  - [ ] Video import and slicing support

-----

## 📝 Changelog

### v2.1.0 (2025-11-22)

  * **Core Upgrade**: Migrated inference to ONNX Runtime, removing PyTorch dependencies.
  * **Compilation**: Implemented Nuitka compilation for the backend (`web_api.exe`).
  * **Stability**: Added backend health checks, latency monitoring, and improved error logging.

### v2.0.0 (2025-11-19)

  * **Release**: First stable release with `.msi` installer, redesigned Import/Export flows, and UI overhaul.

-----

## 📂 Project Structure

```text
SMARKMediaTools
├── python/
│   ├── web_api.py             # FastAPI Backend Source
│   ├── out/web_api.exe        # Nuitka Compiled Binary
│   ├── checkpoint/            # ONNX Models
│   └── utils/                 # Image Processing Logic
├── src/
│   ├── main.ts                # Electron Main Process
│   ├── renderer/pages/        # React Pages
│   └── components/            # UI Components
└── package.json
```

-----

## 📄 License & Credits

This project is licensed under the **Apache License 2.0**.

  * **LAR-IQA**: [https://github.com/nasimjamshidi/LAR-IQA](https://github.com/nasimjamshidi/LAR-IQA)
  * **UI Template**: [electron-shadcn](https://github.com/LuanRoger/electron-shadcn)

**Author**: [SMARK](https://github.com/SMARK2022) | 📧 SMARK2019@outlook.com
