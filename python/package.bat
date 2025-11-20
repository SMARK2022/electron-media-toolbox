@echo off
setlocal ENABLEDELAYEDEXPANSION

REM ============================
REM 配置区：按需修改
REM ============================

REM 1) 你的 Python 解释器（建议是干净环境中跑 web_api 的那个）
set PYTHON_EXE=python

REM 2) 主入口文件（相对本 bat 所在目录）
set MAIN_FILE=web_api.py

REM 3) 输出目录：会在 python\out 下生成 exe 以及依赖
set OUTPUT_DIR=out

REM 4) ONNX 模型文件（位于 ./checkpoint/ 下，有 .onnx 和 .onnx.data 两个）
set MODEL_DIR=checkpoint
set MODEL_NAME=lar_iqa.onnx

REM 5) 并行编译 job 数（用系统 CPU 核心数）
set JOBS=%NUMBER_OF_PROCESSORS%

REM ============================
REM 开始执行
REM ============================

echo [*] 切换到脚本所在目录...
cd /d "%~dp0"

echo [*] 清理旧输出目录 "%OUTPUT_DIR%" ...
if exist "%OUTPUT_DIR%" (
  rmdir /s /q "%OUTPUT_DIR%"
)

echo [*] 使用 Nuitka 编译 %MAIN_FILE% 为独立 exe (standalone, 非 onefile) ...

"%PYTHON_EXE%" -m nuitka ^
  --mode=standalone ^                     ^
  --output-dir="%OUTPUT_DIR%" ^
  --follow-imports ^
  --assume-yes-for-downloads ^
  --jobs=%JOBS% ^
  --include-package-data=onnxruntime ^
  --windows-console-mode=attach ^
  ^
  --include-data-file="%MODEL_DIR%\%MODEL_NAME%=%MODEL_DIR%\%MODEL_NAME%" ^
  --include-data-file="%MODEL_DIR%\%MODEL_NAME%.data=%MODEL_DIR%\%MODEL_NAME%.data" ^
  "%MAIN_FILE%"

echo.
echo [*] 编译完成，输出目录：%OUTPUT_DIR%
echo [*] 你应该能在 "%OUTPUT_DIR%" 下看到 web_api.exe 以及依赖文件夹。
echo [*] 从 CMD 中运行时：其日志会直接输出到当前 CMD，而不会新开控制台。
echo.
pause
endlocal
