@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64
if errorlevel 1 (
    echo Failed to set up VS environment
    exit /b 1
)
cd /d "%~dp0"
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
npx tauri build --debug
if errorlevel 1 (
    echo Build failed
    exit /b 1
)
echo Debug build succeeded!

