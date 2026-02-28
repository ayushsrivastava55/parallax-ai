#!/bin/bash
set -e

echo "═══ Flash Gateway — VPS Setup ═══"

# 1. Install Node.js 23 + bun + pm2
if ! command -v node &>/dev/null; then
  echo "Installing Node.js 23..."
  curl -fsSL https://deb.nodesource.com/setup_23.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v bun &>/dev/null; then
  echo "Installing bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

if ! command -v pm2 &>/dev/null; then
  echo "Installing pm2..."
  npm install -g pm2
fi

if ! command -v tsx &>/dev/null; then
  echo "Installing tsx..."
  npm install -g tsx
fi

# 2. Install dependencies
echo "Installing flash-agent dependencies..."
cd flash-agent && bun install && cd ..

echo "Installing frontend dependencies..."
cd frontend && bun install && cd ..

# 3. Build frontend
echo "Building frontend..."
cd frontend && bun run build && cd ..

# 4. Create logs dir
mkdir -p logs

# 5. Remind about .env
if [ ! -f flash-agent/.env ]; then
  echo ""
  echo "⚠ Missing flash-agent/.env — copy it from your local machine:"
  echo "  scp flash-agent/.env user@your-vps:$(pwd)/flash-agent/.env"
  echo ""
  exit 1
fi

# 6. Start with PM2
echo "Starting Flash Gateway with PM2..."
pm2 start ecosystem.config.cjs
pm2 save

echo ""
echo "═══ Done ═══"
echo "  Status:  pm2 status"
echo "  Logs:    pm2 logs flash-gateway"
echo "  Restart: pm2 restart flash-gateway"
echo "  Health:  curl http://localhost:3000/v1/system/health"
