@echo off
REM ================================================
REM NVM Setup & Node.js Upgrade Script
REM ================================================
REM Run as ADMINISTRATOR

echo.
echo ================================================
echo NVM Setup & Node.js Upgrade
echo ================================================
echo.

REM Check if running as admin
net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: Must run as Administrator!
    echo.
    echo Right-click this file and select "Run as administrator"
    pause
    exit /b 1
)

echo [1/6] Adding NVM to PATH...
setx PATH "%PATH%;C:\nvm4w\nodejs" >nul
if errorlevel 1 (
    echo Warning: Could not update PATH. Try manually.
)

echo [2/6] Close and reopen CMD/Terminal, then continue...
echo Waiting 3 seconds...
timeout /t 3

echo.
echo [3/6] Checking NVM...
nvm --version
if errorlevel 1 (
    echo ERROR: NVM not found!
    echo Make sure C:\nvm4w\nodejs exists and is in PATH
    echo Then restart this script
    pause
    exit /b 1
)

echo.
echo [4/6] Listing available Node versions...
nvm list available | head -15

echo.
echo [5/6] Installing Node 20 LTS...
nvm install 20.11.0

echo.
echo [6/6] Switching to Node 20...
nvm use 20.11.0

echo.
echo ================================================
echo Upgrade Complete!
echo ================================================
echo.
node --version
npm --version
echo.
echo Next: npm install --legacy-peer-deps
echo.

pause
