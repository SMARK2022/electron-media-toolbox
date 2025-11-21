@echo off
chcp 65001 >nul 2>&1
setlocal ENABLEDELAYEDEXPANSION

REM ============================
REM 配置区：按需修改
REM ============================

REM 1) Python 解释器（当前虚拟环境里那个）
set "PYTHON_EXE=python"

REM 2) 主入口文件（注意：现在在当前目录下）
set "MAIN_FILE=web_api.py"

REM 3) 输出目录（相对项目根目录\python）
set "OUTPUT_DIR=out"

REM 4) ONNX 模型文件（.onnx + .onnx.data，放在 python/checkpoint 下）
set "MODEL_DIR=checkpoint"
set "MODEL_NAME=lar_iqa.onnx"

REM 5) 并行 C 编译 job 数
set "JOBS=%NUMBER_OF_PROCESSORS%"

REM 6) Nuitka 缓存目录：固定在项目根下的 python\.nuitka-cache
REM    这样即使脚本挪到 scripts/，也仍然复用原来的缓存
if not defined NUITKA_CACHE_DIR (
  set "NUITKA_CACHE_DIR=%~dp0..\python\.nuitka-cache"
)

REM 可选：为 clcache/ccache 单独指定缓存位置
if not defined NUITKA_CACHE_DIR_CLCACHE (
  set "NUITKA_CACHE_DIR_CLCACHE=%NUITKA_CACHE_DIR%\clcache"
)
if not defined NUITKA_CACHE_DIR_CCACHE (
  set "NUITKA_CACHE_DIR_CCACHE=%NUITKA_CACHE_DIR%\ccache"
)

REM 可选：如果你知道 Nuitka 下载的 ccache.exe 在哪，可以显式指定
REM set "NUITKA_CCACHE_BINARY=%LOCALAPPDATA%\Nuitka\Nuitka\Cache\ccache\ccache.exe"

echo [*] NUITKA_CACHE_DIR=%NUITKA_CACHE_DIR%
echo [*] NUITKA_CACHE_DIR_CLCACHE=%NUITKA_CACHE_DIR_CLCACHE%
echo [*] NUITKA_CACHE_DIR_CCACHE=%NUITKA_CACHE_DIR_CCACHE%

REM ============================
REM 开始执行
REM ============================

echo [*] 切换到项目根目录（scripts 的上一级）...
cd /d "%~dp0..\python"

echo [*] 使用 Nuitka 编译 %MAIN_FILE% 为独立 exe (standalone) ...

"%PYTHON_EXE%" -m nuitka ^
  --mode=onefile ^
  --output-dir="%OUTPUT_DIR%" ^
  --jobs=%JOBS% ^
  --assume-yes-for-downloads ^
  --windows-console-mode=attach ^
  --lto=no ^
  --include-data-file="%MODEL_DIR%\%MODEL_NAME%=%MODEL_DIR%\%MODEL_NAME%" ^
  --include-data-file="%MODEL_DIR%\%MODEL_NAME%.data=%MODEL_DIR%\%MODEL_NAME%.data" ^
  "%MAIN_FILE%"

echo.
echo [*] 编译完成，输出目录：%OUTPUT_DIR%
echo [*] 你应该能在 "%OUTPUT_DIR%" 下看到 web_api.exe 以及依赖文件夹。
echo.
endlocal
