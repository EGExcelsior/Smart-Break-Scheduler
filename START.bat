@echo off
echo ========================================
echo Break Scheduler V6.5 - Quick Start
echo ========================================
echo.
echo Starting Backend Server...
cd backend
start cmd /k "npm install && npm start"

timeout /t 5

echo Starting Frontend Server...
cd ../frontend
start cmd /k "npm install && npm start"

echo.
echo ========================================
echo Servers Starting!
echo ========================================
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo Press any key to exit this window...
pause > nul
