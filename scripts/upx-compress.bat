@echo off
chcp 65001 >nul 2>&1
setlocal ENABLEDELAYEDEXPANSION

REM ============================
REM Basic config
REM ============================

REM 1) go to project root (parent of scripts)
cd /d "%~dp0"
cd ..

REM 2) original Nuitka dist dir (source)
set "DIST_DIR_SRC=python\out\web_api.dist"

REM 3) copied working dir (target)
set "DST_ROOT=out"
set "DIST_DIR_DST=%DST_ROOT%\python_dist"

REM 4) upx executable
set "UPX_EXE=upx.exe"

REM 5) only compress DLLs >= SIZE_THRESHOLD_MB
set "SIZE_THRESHOLD_MB=8"

REM 6) max parallel upx jobs
if not defined N_JOBS (
    set "N_JOBS=%NUMBER_OF_PROCESSORS%"
)
if %N_JOBS% GTR 6 set "N_JOBS=6"

REM 7) UPX flags (ascii only in comments)
REM   -8                 medium-high compression
REM   --lzma             stronger compression (slower)
REM   --compress-icons=0 do not touch icons
REM   --strip-relocs=0   keep relocations
REM   --force            force compression
set "UPX_FLAGS=-8 --lzma --compress-icons=0 --strip-relocs=0 --force"

REM size threshold in bytes
set /a SIZE_THRESHOLD_BYTES=%SIZE_THRESHOLD_MB%*1024*1024

echo [*] 源目录: %DIST_DIR_SRC%
echo [*] 目标工作目录: %DIST_DIR_DST%
echo [*] 压缩阈值: %SIZE_THRESHOLD_MB% MB
echo [*] 最大并行任务数 N_JOBS=%N_JOBS%
echo [*] 使用参数: %UPX_FLAGS%
echo.

if not exist "%DIST_DIR_SRC%" (
    echo [!] 源目录不存在: "%DIST_DIR_SRC%"
    goto :end
)

REM ============================
REM prepare target and copy
REM ============================

echo [*] 确保目标根目录存在: "%DST_ROOT%"
if not exist "%DST_ROOT%" (
    mkdir "%DST_ROOT%"
)

echo [*] 清理旧的目标目录（如果存在）...
if exist "%DIST_DIR_DST%" (
    echo     删除 "%DIST_DIR_DST%" ...
    rmdir /S /Q "%DIST_DIR_DST%"
)

echo [*] 创建新的目标目录: "%DIST_DIR_DST%"
mkdir "%DIST_DIR_DST%"

echo [*] 复制 "%DIST_DIR_SRC%" -> "%DIST_DIR_DST%" ...
xcopy "%DIST_DIR_SRC%\*" "%DIST_DIR_DST%\" /E /I /Y >nul
if errorlevel 4 (
    echo [!] xcopy 复制时发生错误（errorlevel=%ERRORLEVEL%），请检查路径或权限。
    goto :end
)

echo.
echo [*] 目录复制完成，目标目录内容（前几项）：
dir /b "%DIST_DIR_DST%"
echo.

REM ============================
REM run UPX in copied dir
REM ============================

set "DIST_DIR=%DIST_DIR_DST%"
echo [*] 将在目录中执行 UPX 压缩: "%DIST_DIR%"
echo.

for %%F in ("%DIST_DIR%\*.dll") do (
    set "FILE=%%~fF"
    set "SIZE=%%~zF"

    if !SIZE! GEQ %SIZE_THRESHOLD_BYTES% (
        echo [*] 准备压缩 "!FILE!" (大小: !SIZE! bytes) ...
        call :wait_for_slot
        start "" /B "%UPX_EXE%" %UPX_FLAGS% "%%F"
    ) else (
        echo [-] 跳过(文件较小): "%%F" (大小: !SIZE! bytes)
    )
)

REM ============================
REM wait for all upx processes
REM ============================

echo.
echo [*] 等待所有 UPX 进程结束...

:wait_all
set "RUNNING=0"
for /f "tokens=*" %%P in ('tasklist /fi "imagename eq upx.exe" /nh ^| find /i "upx.exe"') do (
    set /a RUNNING+=1
)
if !RUNNING! GTR 0 (
    timeout /t 1 >nul
    goto :wait_all
)

echo.
echo [*] 所有 DLL 压缩完成。
goto :end

REM ============================
REM subroutine: limit concurrency
REM ============================
:wait_for_slot
set "RUNNING=0"
for /f "tokens=*" %%P in ('tasklist /fi "imagename eq upx.exe" /nh ^| find /i "upx.exe"') do (
    set /a RUNNING+=1
)

if !RUNNING! GEQ %N_JOBS% (
    timeout /t 1 >nul
    goto :wait_for_slot
)
exit /b

REM ============================
REM end
REM ============================
:end
pause
endlocal
