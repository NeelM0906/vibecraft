#!/bin/bash
# Vibecraft Startup Script
# Starts both the Vite dev server and WebSocket server

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PLUGIN_DIR"

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Create data directory if needed
mkdir -p "$PLUGIN_DIR/data"

echo "Starting Vibecraft..."
echo "  Frontend: http://localhost:4002"
echo "  WebSocket: ws://localhost:4003"
echo ""

npm run dev
