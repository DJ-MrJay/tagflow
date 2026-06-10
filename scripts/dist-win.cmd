@echo off
setlocal

set "ROOT=%~dp0.."
set "OUTDIR=%TEMP%\tagflow-release"
set "RELEASEDIR=%ROOT%\release"

echo Building TagFlow installer...
call npm.cmd run build
if errorlevel 1 exit /b 1

if exist "%OUTDIR%" rmdir /s /q "%OUTDIR%"

echo Packaging with electron-builder using temp output...
call "%ROOT%\node_modules\.bin\electron-builder.cmd" --win nsis --config.directories.output="%OUTDIR%"
if errorlevel 1 exit /b 1

if not exist "%RELEASEDIR%" mkdir "%RELEASEDIR%"
del /q "%RELEASEDIR%\TagFlow-Setup-*.exe" 2>nul
del /q "%RELEASEDIR%\TagFlow-Setup-*.exe.blockmap" 2>nul

copy /y "%OUTDIR%\TagFlow-Setup-*.exe" "%RELEASEDIR%\" >nul
copy /y "%OUTDIR%\TagFlow-Setup-*.exe.blockmap" "%RELEASEDIR%\" >nul

echo.
echo Installer copied to:
echo   %RELEASEDIR%
dir "%RELEASEDIR%\TagFlow-Setup-*"
