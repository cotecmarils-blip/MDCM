@echo off
cd /d "c:\Users\btovar\OneDrive - Cotecmar\Escritorio\CODIGOS\MCDM\frontend"
echo Installing dependencies...
call npm install
if errorlevel 1 (
    echo Error during npm install
    pause
    exit /b 1
)
echo Done!
pause
