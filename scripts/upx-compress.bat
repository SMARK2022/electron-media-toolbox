@echo off
chcp 65001 >nul 2>&1
setlocal ENABLEDELAYEDEXPANSION

REM ============================
REM 基本配置
REM ============================

cd /d "%~dp0"
cd ..

set "DIST_DIR_SRC=python\out\web_api.dist"
set "DST_ROOT=out"
set "DIST_DIR_DST=%DST_ROOT%\python_dist"
set "UPX_EXE=upx.exe"
set "SIZE_THRESHOLD_MB=8"

if not defined N_JOBS set "N_JOBS=%NUMBER_OF_PROCESSORS%"
if %N_JOBS% GTR 6 set "N_JOBS=6"

set "UPX_FLAGS=-8 --lzma --compress-icons=0 --strip-relocs=0 --force"
set /a SIZE_THRESHOLD_BYTES=%SIZE_THRESHOLD_MB%*1024*1024

echo [*] 源目录: %DIST_DIR_SRC%
echo [*] 目标工作目录: %DIST_DIR_DST%
echo [*] 压缩阈值: %SIZE_THRESHOLD_MB% MB, 并行数: %N_JOBS%
echo.

if not exist "%DIST_DIR_SRC%" (
    echo [!] 源目录不存在: "%DIST_DIR_SRC%"
    goto :end
)

REM ============================
REM 准备目标目录并复制
REM ============================

if not exist "%DST_ROOT%" mkdir "%DST_ROOT%"

if exist "%DIST_DIR_DST%" (
    echo [*] 清理旧目录...
    rmdir /S /Q "%DIST_DIR_DST%" 2>nul
    timeout /t 1 /nobreak >nul
)

mkdir "%DIST_DIR_DST%" 2>nul

echo [*] 复制文件...
xcopy "%DIST_DIR_SRC%\*" "%DIST_DIR_DST%\" /E /I /Y /Q >nul 2>&1
REM xcopy: errorlevel >=4 为严重错误，这里只拦截 4+
if errorlevel 4 (
    echo [!] 复制失败，请检查权限或路径
    goto :end
)

echo [*] 复制完成
echo.

REM ============================
REM 递归遍历并压缩 DLL & EXE
REM ============================

set "DIST_DIR=%DIST_DIR_DST%"
echo [*] 开始递归扫描并压缩大于 %SIZE_THRESHOLD_MB% MB 的 DLL/EXE...
echo.

REM ---- DLL ----
for /R "%DIST_DIR%" %%F in (*.dll) do (
    set "FSIZE=%%~zF"

    if defined FSIZE (
        if !FSIZE! GEQ %SIZE_THRESHOLD_BYTES% (
            set "FULL_PATH=%%F"
            set "REL_PATH=!FULL_PATH:%DIST_DIR%\=!"
            echo [*] 压缩 DLL: !REL_PATH! ^(!FSIZE! bytes^)
            call :wait_for_slot
            start "" /B "%UPX_EXE%" %UPX_FLAGS% "%%F" 2>nul
        )
    )
)

REM ---- EXE ----
for /R "%DIST_DIR%" %%F in (*.exe) do (
    set "FSIZE=%%~zF"

    if defined FSIZE (
        if !FSIZE! GEQ %SIZE_THRESHOLD_BYTES% (
            set "FULL_PATH=%%F"
            set "REL_PATH=!FULL_PATH:%DIST_DIR%\=!"
            echo [*] 压缩 EXE: !REL_PATH! ^(!FSIZE! bytes^)
            call :wait_for_slot
            start "" /B "%UPX_EXE%" %UPX_FLAGS% "%%F" 2>nul
        )
    )
)

REM ============================
REM 等待所有 upx 结束
REM ============================

echo.
echo [*] 等待所有 UPX 进程完成...

:wait_all
set "RUNNING=0"
for /f %%P in ('tasklist /fi "imagename eq upx.exe" /nh 2^>nul ^| find /c /i "upx.exe"') do (
    set "RUNNING=%%P"
)
if !RUNNING! GTR 0 (
    timeout /t 1 /nobreak >nul
    goto :wait_all
)

echo.
echo [*] 压缩完成
goto :end

REM ============================
REM 限制并发数
REM ============================
:wait_for_slot
set "RUNNING=0"
for /f %%P in ('tasklist /fi "imagename eq upx.exe" /nh 2^>nul ^| find /c /i "upx.exe"') do (
    set "RUNNING=%%P"
)
if !RUNNING! GEQ %N_JOBS% (
    timeout /t 1 /nobreak >nul
    goto :wait_for_slot
)
exit /b

:end
endlocal
