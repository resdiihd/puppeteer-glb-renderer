#!/bin/bash

# GLB Renderer Docker Container Startup Script
set -e

echo "🚀 Starting GLB Renderer Production Container..."

# Environment validation
DOMAIN=${DOMAIN:-"localhost"}
CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-""}
NODE_ENV=${NODE_ENV:-"production"}

echo "📋 Configuration:"
echo "  - Domain: $DOMAIN"
echo "  - Environment: $NODE_ENV"
echo "  - SSL: $([ -n "$CLOUDFLARE_API_TOKEN" ] && echo "Enabled (Cloudflare)" || echo "Self-signed")"

# Create necessary directories
mkdir -p /app/storage/uploads /app/storage/renders /var/log/nginx /var/log/pm2 /etc/ssl/certs /etc/ssl/private /acme

# Set proper permissions (use || true to not fail on permission errors)
chown -R nginx:nginx /var/log/nginx /acme 2>/dev/null || true
chown -R nginx:nginx /app/storage /var/log/pm2 2>/dev/null || true
chmod -R 755 /app/storage 2>/dev/null || echo "⚠️ Storage permissions set by host, continuing..."

# SSL Certificate Setup
echo "🔐 Setting up SSL certificates..."
if [ -f "/app/docker/ssl-setup.sh" ]; then
    chmod +x /app/docker/ssl-setup.sh
    bash /app/docker/ssl-setup.sh
    
    if [ $? -ne 0 ]; then
        echo "⚠️  SSL setup failed, starting without HTTPS..."
        # Use HTTP-only configuration
        cp /app/docker/default.conf /etc/nginx/conf.d/default.conf
    else
        echo "✅ SSL certificates configured successfully"
        # Use SSL configuration
        cp /app/docker/ssl.conf /etc/nginx/conf.d/default.conf
    fi
else
    echo "⚠️  SSL setup script not found, using HTTP-only configuration"
    cp /app/docker/default.conf /etc/nginx/conf.d/default.conf
fi

# Continue with startup regardless of permission issues
echo "🚀 Continuing with service startup..."

# Test Nginx configuration
echo "🧪 Testing Nginx configuration..."
nginx -t
if [ $? -ne 0 ]; then
    echo "❌ Nginx configuration test failed!"
    exit 1
fi

# Start Node.js application with PM2
echo "📦 Starting Node.js application with PM2..."
cd /app
export NODE_ENV=$NODE_ENV
export DOMAIN=$DOMAIN

# Start PM2 process in background
pm2 start /app/docker/ecosystem.config.js --env $NODE_ENV &

# Wait for application to start
echo "⏳ Waiting for application to start..."
sleep 15

# Health check
for i in {1..20}; do
    if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
        echo "✅ Node.js application started successfully!"
        break
    else
        if [ $i -eq 20 ]; then
            echo "❌ Application failed to start after 20 attempts"
            pm2 logs --lines 50
            exit 1
        fi
        echo "⏳ Waiting for application... (attempt $i/20)"
        sleep 3
    fi
done

# Start Nginx
echo "🌐 Starting Nginx reverse proxy..."
exec nginx -g "daemon off;"