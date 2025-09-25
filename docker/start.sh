#!/bin/sh
set -e

echo "🚀 Starting GLB Renderer Docker Container..."

# Create log directories
mkdir -p /var/log/pm2 /var/log/nginx

# Ensure storage directories exist with proper permissions
mkdir -p /app/storage/uploads /app/storage/renders
chown -R root:root /app/storage || true
chmod -R 777 /app/storage || true

# Start PM2 process manager with Node.js application
echo "📦 Starting Node.js application with PM2..."
cd /app

# Set environment variables
export NODE_ENV=production
export PORT=3000
export HOST=0.0.0.0

# Start Node.js with PM2 in background
pm2 start ecosystem.config.js --env production

# Wait for application to start
echo "⏳ Waiting for application to start..."
sleep 15

# Test if application is running
if ! curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "❌ Application failed to start, checking logs..."
    pm2 logs --lines 50
    exit 1
fi

echo "✅ Node.js application started successfully!"
echo "🌐 Starting Nginx reverse proxy..."

# Test nginx configuration
nginx -t || exit 1

# Start nginx in foreground
exec nginx -g "daemon off;"
    exit 1
fi

echo "✅ Application started successfully"

# Start Nginx in foreground
echo "🌐 Starting Nginx reverse proxy..."
nginx -g 'daemon off;'