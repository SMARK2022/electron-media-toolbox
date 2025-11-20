@echo off
setlocal ENABLEDELAYEDEXPANSION

REM ============================
REM 配置区：按需修改
REM ============================

REM 你的 Python 解释器（建议是当前运行 web_api.py 的环境）
set PYTHON_EXE=python

REM 主文件（相对本 bat 所在目录）
set MAIN_FILE=web_api.py

REM 输出目录：会在 python\out-web_api 下生成 exe
set OUTPUT_DIR=out-web_api

REM ONNX 模型文件名（位于 ./checkpoint/ 下）
set MODEL_DIR=checkpoint
set MODEL_NAME=lar_iqa.onnx

REM ============================
REM 开始执行
REM ============================

echo [*] 切换到脚本所在目录...
cd /d "%~dp0"

echo [*] 清理旧输出目录 "%OUTPUT_DIR%" ...
if exist "%OUTPUT_DIR%" (
  rmdir /s /q "%OUTPUT_DIR%"
)

echo [*] 使用 Nuitka 编译 %MAIN_FILE% 为独立 exe ...

"%PYTHON_EXE%" -m nuitka ^
  --onefile ^
  --standalone ^
  --follow-imports ^
  --assume-yes-for-downloads ^
  --output-dir="%OUTPUT_DIR%" ^
  --remove-output ^
  --windows-console-mode=disable ^
  --include-data-file="%MODEL_DIR%\%MODEL_NAME%=%MODEL_DIR%\%MODEL_NAME%" ^
  --include-data-file="%MODEL_DIR%\%MODEL_NAME%.data=%MODEL_DIR%\%MODEL_NAME%.data" ^
  "%MAIN_FILE%"

echo.
echo [*] 编译完成，输出目录：%OUTPUT_DIR%
echo [*] 你应该能在 "%OUTPUT_DIR%" 下看到 web_api.exe
echo.
pause
endlocal
