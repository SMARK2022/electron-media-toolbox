@echo off
chcp 65001 >nul 2>&1

REM ============================
REM 0) 激活 Conda 环境：nuitka
REM ============================

REM Conda 环境名称
set "CONDA_ENV_NAME=nuitka"

REM 可选：如果你想用固定的 conda.bat 路径，取消下一行注释并改成你自己的路径
REM 例如：D:\ProgramData\miniforge3\condabin\conda.bat
REM set "CONDA_BAT=D:\ProgramData\miniforge3\condabin\conda.bat"

echo [*] 正在激活 Conda 环境 "%CONDA_ENV_NAME%"...

if defined CONDA_BAT (
  if exist "%CONDA_BAT%" (
    call "%CONDA_BAT%" activate "%CONDA_ENV_NAME%"
  ) else (
    echo [!] CONDA_BAT="%CONDA_BAT%" 不存在，尝试使用 PATH 中的 conda...
    call conda activate "%CONDA_ENV_NAME%"
  )
) else (
  REM 直接使用 PATH 中的 conda（建议从 Anaconda Prompt 或配置好 PATH 的 CMD 调用本脚本）
  call conda activate "%CONDA_ENV_NAME%"
)

if errorlevel 1 (
  echo [!] 激活 Conda 环境 "%CONDA_ENV_NAME%" 失败，终止编译。
  goto :end
)

echo [*] Conda 环境已激活，当前使用的 python 为：
where python
echo.

REM 这里再 setlocal，保证后面环境变量只在脚本内部生效
setlocal ENABLEDELAYEDEXPANSION

REM ============================
REM 1) 配置区：按需修改
REM ============================

REM 使用当前环境里的 python
set "PYTHON_EXE=python"

REM 主入口文件（位于 python 目录下）
set "MAIN_FILE=web_api.py"

REM 输出目录（相对 python 目录）
set "OUTPUT_DIR=out"

REM ONNX 模型文件（.onnx + .onnx.data，放在 python/checkpoint 下）
set "MODEL_DIR=checkpoint"
set "MODEL_NAME=lar_iqa.onnx"

REM 并行 C 编译 job 数
set "JOBS=%NUMBER_OF_PROCESSORS%"

REM Nuitka 缓存目录：固定在项目根下的 python\.nuitka-cache
REM 这样即使脚本挪到 scripts/，也仍然复用原来的缓存
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
echo.

REM ============================
REM 2) 开始执行编译
REM ============================

echo [*] 切换到 python 目录（scripts 的上一级）...
cd /d "%~dp0..\python"

echo [*] 使用 Nuitka 编译 %MAIN_FILE% 为单文件 exe (--mode=onefile) ...

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
echo [*] 你应该能在 "%OUTPUT_DIR%" 下看到 web_api.exe（Onefile 单文件可执行）。
echo.

:end
endlocal
