@echo off
REM ======================================
REM SIMPLE NPM INSTALL - Prisma & Dependencies
REM ======================================

cd /d C:\laragon\www\emgWeb\emg

echo.
echo ========================================
echo NPM INSTALL - Prisma dan Dependencies
echo ========================================
echo.
echo Ini akan download ~500 packages (~2GB)
echo Tunggu 3-5 menit...
echo.

REM Check npm exists
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: NPM tidak ditemukan!
    echo Install Node.js dari https://nodejs.org
    pause
    exit /b 1
)

echo [1/5] Cleanup...
rmdir /s /q node_modules >nul 2>&1
del package-lock.json >nul 2>&1

echo [2/5] Clear cache...
npm cache clean --force

echo [3/5] INSTALLING - Please wait (this is slow)...
npm install --legacy-peer-deps

if errorlevel 1 (
    echo.
    echo ERROR: Install failed!
    echo Try again manually:
    echo   npm install --legacy-peer-deps
    pause
    exit /b 1
)

echo.
echo [4/5] Generate Prisma...
npx prisma generate

echo.
echo [5/5] Build test...
npm run build

echo.
echo ========================================
echo SUCCESS! Prisma installed.
echo ========================================
echo.
echo Next: Read TESTING_CHECKLIST.md
echo.

pause
