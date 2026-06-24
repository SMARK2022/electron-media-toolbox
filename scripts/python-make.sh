#!/bin/bash
# ============================================================
# macOS / Linux Nuitka 编译脚本
# ============================================================
# 等价于 Windows 的 python-make.bat，将 web_api.py 编译为单文件可执行
# 输出：python/out/web_api（macOS 上无 .exe 扩展名）
#
# 用法：
#   conda activate mediatoolbox && bash scripts/python-make.sh
#   或直接：python -m nuitka ...（需在 python 目录下）
# ============================================================
set -euo pipefail

# ============================
# 0) 激活 Conda 环境
# ============================
CONDA_ENV_NAME="${CONDA_ENV_NAME:-nuitka}"

echo "[*] 正在激活 Conda 环境 \"${CONDA_ENV_NAME}\"..."

# 尝试多种方式激活 conda 环境
if [ -n "${CONDA_PREFIX:-}" ] && [ "$(basename "$CONDA_PREFIX")" = "$CONDA_ENV_NAME" ]; then
  echo "[*] 已在 ${CONDA_ENV_NAME} 环境中"
elif command -v conda &>/dev/null; then
  eval "$(conda shell.bash hook)"
  conda activate "$CONDA_ENV_NAME"
else
  # 兜底：直接用 conda env 的 python 绝对路径
  CONDA_PYTHON="${HOME}/miniconda3/envs/${CONDA_ENV_NAME}/bin/python"
  if [ ! -f "$CONDA_PYTHON" ]; then
    echo "[!] Conda 环境 ${CONDA_ENV_NAME} 未找到，请先创建：conda create -n ${CONDA_ENV_NAME} python=3.11 -y"
    exit 1
  fi
  echo "[*] 使用绝对路径 Python: ${CONDA_PYTHON}"
  PYTHON_EXE="$CONDA_PYTHON"
fi

if [ -z "${PYTHON_EXE:-}" ]; then
  PYTHON_EXE="python"
fi

echo "[*] 当前 Python: $(which "$PYTHON_EXE")"
echo "[*] Python 版本: $("$PYTHON_EXE" --version)"

# ============================
# 1) 配置区
# ============================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_DIR="$(cd "${SCRIPT_DIR}/../python" && pwd)"
MAIN_FILE="web_api.py"
OUTPUT_DIR="out"
MODEL_DIR="checkpoint"
JOBS="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"

# Nuitka 缓存目录：与 Windows 版保持一致的相对路径
export NUITKA_CACHE_DIR="${NUITKA_CACHE_DIR:-${PYTHON_DIR}/.nuitka-cache}"

echo "[*] NUITKA_CACHE_DIR=${NUITKA_CACHE_DIR}"
echo "[*] 切换到 python 目录: ${PYTHON_DIR}"
cd "${PYTHON_DIR}"

# ============================
# 2) 开始编译
# ============================
# macOS 用 --mode=app（standalone + app bundle），因为 PyObjC Foundation 框架
# 要求 app bundle 目录结构，--mode=onefile 会触发 Nuitka options-nanny FATAL。
# 产物是 web_api.app/ 目录（非单文件），二进制在 Contents/MacOS/web_api。
# standalone 模式无需 onefile 解压，启动时间 ~1s（vs onefile 冷启动 ~15s）。
echo "[*] 使用 Nuitka 编译 ${MAIN_FILE} 为 app bundle（standalone + .app 目录）..."

"$PYTHON_EXE" -m nuitka \
  --mode=app \
  --output-dir="${OUTPUT_DIR}" \
  --output-filename="web_api" \
  --jobs="${JOBS}" \
  --assume-yes-for-downloads \
  --lto=no \
  --include-package=Quartz \
  --include-package=Foundation \
  --include-package=objc \
  --include-package=QuickLookThumbnailing \
  --include-data-file="${MODEL_DIR}/lar_iqa.onnx=${MODEL_DIR}/lar_iqa.onnx" \
  --include-data-file="${MODEL_DIR}/2d106det_batch.onnx=${MODEL_DIR}/2d106det_batch.onnx" \
  --include-data-file="${MODEL_DIR}/det_10g.onnx=${MODEL_DIR}/det_10g.onnx" \
  --include-data-file="${MODEL_DIR}/ocec_l.onnx=${MODEL_DIR}/ocec_l.onnx" \
  --nofollow-import-to=websockets \
  --nofollow-import-to=httptools \
  --nofollow-import-to=yaml \
  --nofollow-import-to=numpy.tests \
  "${MAIN_FILE}"

# set -euo pipefail 已在脚本顶部设置，Nuitka 失败时自动退出非零码

echo ""
echo "[*] 编译完成，输出目录：${OUTPUT_DIR}"
echo "[*] 可执行文件：${OUTPUT_DIR}/web_api.app/Contents/MacOS/web_api（app bundle）"
echo "[*] standalone 模式无需解压，启动时间约 1 秒"
echo ""
