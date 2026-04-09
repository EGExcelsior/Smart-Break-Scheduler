#!/bin/bash
set -e

echo "🔨 Building Smart-Break-Scheduler..."
echo ""

echo "📦 Installing backend dependencies..."
cd backend
npm install

echo ""
echo "🎨 Building frontend & bundling with backend..."
npm run build

echo ""
echo "✅ Build complete! Frontend ready at frontend/build/"
echo "   Backend will serve static files from frontend/build/ on startup"
