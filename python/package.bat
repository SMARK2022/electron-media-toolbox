@echo off
setlocal ENABLEDELAYEDEXPANSION

REM ============================
REM 配置区：按需修改
REM ============================

REM 你的 Python 解释器（建议用你当前跑 web_api 的那个环境）
set PYTHON_EXE=python

REM 主文件（相对本 bat 所在目录）
set MAIN_FILE=web_api.py

REM 输出目录：会在 python\out-web_api 下生成 exe
set OUTPUT_DIR=out-web_api

REM ============================
REM 开始执行
REM ============================

echo [*] 切换到脚本所在目录...
cd /d "%~dp0"

echo [*] 清理旧输出目录 "%OUTPUT_DIR%" ...
if exist "%OUTPUT_DIR%" rmdir /s /q "%OUTPUT_DIR%"

echo [*] 使用 Nuitka 编译 %MAIN_FILE% 为独立 exe ...
"%PYTHON_EXE%" -m nuitka ^
  "%MAIN_FILE%" ^
  --standalone ^
  --onefile ^
  --follow-imports ^
  --assume-yes-for-downloads ^
  --output-dir="%OUTPUT_DIR%" ^
  --remove-output ^
  --enable-plugin=numpy ^
  --enable-plugin=multiprocessing ^
  --windows-console-mode=disable ^
  ^
  REM 同时打包 ONNX 主文件和 .data 分片，保持 checkpoint\xxx 路径不变 ^
  --include-data-file="checkpoint\lar_iqa.onnx=checkpoint\lar_iqa.onnx" ^
  --include-data-file="checkpoint\lar_iqa.onnx.data=checkpoint\lar_iqa.onnx.data" ^
  ^
  REM 可选：如果运行时会读训练/验证 CSV，就把 dataset 目录也打进去 ^
  --include-data-dir="packages\LAR_IQA\dataset=packages\LAR_IQA\dataset" ^
  ^
  REM 可选：如果 utils 里有非 .py 资源文件（配置等）也一起带上 ^
  --include-data-dir="utils=utils"

echo.
echo [*] 编译完成，输出目录：%OUTPUT_DIR%
echo [*] 你应该能在 "%OUTPUT_DIR%" 下看到 web_api.exe
echo.
pause
endlocal
