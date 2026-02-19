@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64
if errorlevel 1 (
    echo Failed to set up VS environment
    exit /b 1
)
cd /d "%~dp0"
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
npx tauri build
if errorlevel 1 (
    echo Build failed
    exit /b 1
)
set RELEASE_DIR=%~dp0src-tauri\target\release
if exist "%RELEASE_DIR%\clawpet.exe" (
    echo Build succeeded: "%RELEASE_DIR%\clawpet.exe"
    exit /b 0
)
if exist "%RELEASE_DIR%\clawgotchi.exe" (
    echo clawpet.exe not found. Renaming clawgotchi.exe to clawpet.exe for compatibility.
    copy /Y "%RELEASE_DIR%\clawgotchi.exe" "%RELEASE_DIR%\clawpet.exe" >nul
    if exist "%RELEASE_DIR%\clawgotchi.pdb" (
        copy /Y "%RELEASE_DIR%\clawgotchi.pdb" "%RELEASE_DIR%\clawpet.pdb" >nul
    )
    echo Build succeeded: "%RELEASE_DIR%\clawpet.exe"
    exit /b 0
)
echo Build completed but no executable found in "%RELEASE_DIR%"
exit /b 1

