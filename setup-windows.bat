@echo off
REM ======================================
REM EMG Application - Setup & Build Script
REM ======================================
REM Run this script in Windows CMD to setup and build

cd /d C:\laragon\www\emgWeb\emg

echo.
echo ============================================
echo EMG Application Build & Setup
echo ============================================
echo.

REM Check Node.js
echo [1/8] Checking Node.js...
node --version
if errorlevel 1 (
    echo ERROR: Node.js not found! Please install from nodejs.org
    pause
    exit /b 1
)

echo.
echo [2/8] Checking NPM...
npm --version
if errorlevel 1 (
    echo ERROR: NPM not found!
    pause
    exit /b 1
)

echo.
echo [3/8] Cleaning previous installation...
if exist node_modules (
    echo Removing node_modules...
    rmdir /s /q node_modules
)
if exist package-lock.json (
    echo Removing package-lock.json...
    del package-lock.json
)
if exist .next (
    echo Removing .next cache...
    rmdir /s /q .next
)

echo.
echo [4/8] Clearing npm cache...
call npm cache clean --force

echo.
echo [5/8] Installing dependencies...
echo This may take 2-5 minutes...
call npm install --verbose

if errorlevel 1 (
    echo.
    echo WARNING: npm install encountered errors.
    echo Attempting with legacy peer deps flag...
    echo.
    call npm install --legacy-peer-deps
)

echo.
echo [6/8] Generating Prisma client...
call npx prisma generate
if errorlevel 1 (
    echo ERROR: Prisma generation failed!
    pause
    exit /b 1
)

echo.
echo [7/8] Building application...
call npm run build
if errorlevel 1 (
    echo WARNING: Build encountered errors.
    echo Please review the errors above.
    pause
    exit /b 1
)

echo.
echo [8/8] Linting code...
call npm run lint

echo.
echo ============================================
echo Setup Complete!
echo ============================================
echo.
echo Next steps:
echo 1. Review any build warnings above
echo 2. Run: npm run dev (to start development server)
echo 3. Or deploy to production
echo.
echo Database migration (if schema changed):
echo   npx prisma migrate dev --name "fix_eventlog_bigint"
echo.
pause
