#!/bin/bash

echo "========================================"
echo "Break Scheduler V6.5 - Quick Start"
echo "========================================"
echo ""
echo "Starting Backend Server..."

cd backend
npm install &
BACKEND_PID=$!

sleep 5

echo "Starting Frontend Server..."
cd ../frontend
npm install &
FRONTEND_PID=$!

wait $BACKEND_PID
npm start &

cd ../backend
npm start &

echo ""
echo "========================================"
echo "Servers Starting!"
echo "========================================"
echo "Backend: http://localhost:5000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop servers"

wait
