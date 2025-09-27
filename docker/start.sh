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
        # Choose SSL configuration based on IP whitelist setting
        if [ -n "$ALLOWED_IPS" ]; then
            echo "🔒 Using SSL configuration with IP whitelist: $ALLOWED_IPS"
            cp /app/docker/ssl-whitelist.conf /etc/nginx/conf.d/default.conf
            # Copy custom error page
            mkdir -p /usr/share/nginx/html
            cp /app/docker/403.html /usr/share/nginx/html/403.html
        else
            echo "🌐 Using SSL configuration without IP restrictions"
            cp /app/docker/ssl.conf /etc/nginx/conf.d/default.conf
        fi
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

# Install missing dependencies if needed
if [ ! -d "/app/node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install --production --silent
fi

# Check for critical files
if [ ! -f "/app/src/app.js" ]; then
    echo "❌ Critical file /app/src/app.js not found!"
    ls -la /app/src/
    exit 1
fi

# Start PM2 process with verbose logging
echo "📦 Starting Node.js application with PM2..."
pm2 start /app/docker/ecosystem.config.js --env $NODE_ENV

# Wait a moment for PM2 to initialize
sleep 5

# Check PM2 status
echo "📊 PM2 Process Status:"
pm2 list

# Show initial logs
echo "📋 Initial application logs:"
pm2 logs --lines 20 --raw

# Health check with better error reporting
echo "⏳ Waiting for application to start..."
for i in {1..30}; do
    if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
        echo "✅ Node.js application started successfully!"
        break
    else
        if [ $i -eq 30 ]; then
            echo "❌ Application failed to start after 30 attempts"
            echo "📋 Recent PM2 logs:"
            pm2 logs --lines 100 --raw
            echo "📊 PM2 Process Status:"
            pm2 list
            echo "🔍 Port status:"
            netstat -tulpn | grep :3000 || echo "No process listening on port 3000"
            exit 1
        fi
        if [ $((i % 5)) -eq 0 ]; then
            echo "⏳ Still waiting... (attempt $i/30) - checking PM2 status"
            pm2 list
            pm2 logs --lines 5 --raw
        else
            echo "⏳ Waiting for application... (attempt $i/30)"
        fi
        sleep 2
    fi
done

# Start Nginx
echo "🌐 Starting Nginx reverse proxy..."
exec nginx -g "daemon off;"