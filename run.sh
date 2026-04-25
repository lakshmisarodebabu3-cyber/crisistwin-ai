#!/bin/bash
# CrisisTwin AI — Start Script
# Run this from the project root: bash run.sh

echo ""
echo "🚨 ==============================="
echo "   CrisisTwin AI — Startup"
echo "================================="
echo ""

# Step 1: Install Python dependencies
echo "📦 Installing Python dependencies..."
cd backend
pip install -r requirements.txt --quiet

# Step 2: Start Flask backend in background
echo "🔧 Starting Flask backend on port 5000..."
python app.py &
FLASK_PID=$!

echo "✅ Backend running (PID: $FLASK_PID)"
echo ""

# Step 3: Open frontend
sleep 1.5
echo "🌐 Opening frontend..."

# Try to open in default browser
if command -v open &> /dev/null; then
  open http://localhost:5000
elif command -v xdg-open &> /dev/null; then
  xdg-open http://localhost:5000
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  App running at: http://localhost:5000"
echo "  Press Ctrl+C to stop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Keep running until Ctrl+C
trap "echo ''; echo '🛑 Shutting down...'; kill $FLASK_PID 2>/dev/null; exit 0" INT
wait $FLASK_PID