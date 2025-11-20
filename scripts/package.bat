@echo off
chcp 65001 >nul 2>&1
setlocal ENABLEDELAYEDEXPANSION

REM ============================
REM 配置区：按需修改
REM ============================

REM 1) Python 解释器（当前虚拟环境里那个）
set "PYTHON_EXE=python"

REM 2) 主入口文件
set "MAIN_FILE=web_api.py"

REM 3) 输出目录
set "OUTPUT_DIR=out"

REM 4) ONNX 模型文件（.onnx + .onnx.data）
set "MODEL_DIR=checkpoint"
set "MODEL_NAME=lar_iqa.onnx"

REM 5) 并行 C 编译 job 数
set "JOBS=%NUMBER_OF_PROCESSORS%"

REM 6) Nuitka 缓存目录（放在项目旁边，方便持久化）
if not defined NUITKA_CACHE_DIR (
  set "NUITKA_CACHE_DIR=%~dp0.nuitka-cache"
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

echo [*] 切换到脚本所在目录...
cd /d "%~dp0"

echo [*] 使用 Nuitka 编译 %MAIN_FILE% 为独立 exe (standalone) ...

"%PYTHON_EXE%" -m nuitka ^
  --mode=standalone ^
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
pause
endlocal
