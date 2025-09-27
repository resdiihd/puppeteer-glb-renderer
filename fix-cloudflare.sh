#!/bin/bash

# Quick Fix Script for GLB Renderer Cloudflare Issues
echo "🔧 GLB Renderer Quick Fix Script"
echo "==============================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  Please run as root (sudo)"
    exit 1
fi

# 1. Open firewall ports
echo "🔥 Opening firewall ports..."
if command -v ufw >/dev/null 2>&1; then
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 3000/tcp
    echo "✅ UFW rules added"
elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port=80/tcp
    firewall-cmd --permanent --add-port=443/tcp
    firewall-cmd --permanent --add-port=3000/tcp
    firewall-cmd --reload
    echo "✅ Firewalld rules added"
else
    echo "⚠️  No firewall manager found (ufw/firewalld)"
fi

# 2. Google Cloud firewall (if applicable)
echo "📋 Google Cloud Firewall Commands (run these if on GCP):"
echo "gcloud compute firewall-rules create allow-glb-renderer-http --allow tcp:80 --source-ranges 0.0.0.0/0 --description 'Allow HTTP for GLB Renderer'"
echo "gcloud compute firewall-rules create allow-glb-renderer-https --allow tcp:443 --source-ranges 0.0.0.0/0 --description 'Allow HTTPS for GLB Renderer'"

# 3. Restart services
echo "🔄 Restarting services..."
if [ -f "/etc/systemd/system/docker.service" ] || [ -f "/usr/lib/systemd/system/docker.service" ]; then
    systemctl restart docker
    echo "✅ Docker restarted"
fi

# 4. Rebuild and restart container
echo "🐳 Rebuilding Docker container..."
if [ -f "docker-compose.yml" ]; then
    docker compose down
    docker compose build --no-cache
    docker compose up -d
    echo "✅ Container rebuilt and started"
else
    echo "⚠️  docker-compose.yml not found in current directory"
fi

# 5. Test connectivity
echo "🧪 Testing connectivity..."
sleep 10

# Test local services
echo "Testing local services:"
curl -s -m 5 http://localhost:80 >/dev/null && echo "  HTTP: ✅" || echo "  HTTP: ❌"
curl -s -k -m 5 https://localhost:443 >/dev/null && echo "  HTTPS: ✅" || echo "  HTTPS: ❌"
curl -s -m 5 http://localhost:3000/health >/dev/null && echo "  Node.js: ✅" || echo "  Node.js: ❌"

# 6. Show next steps
echo -e "\n📋 Next Steps:"
echo "1. Verify your domain DNS points to this server's IP:"
echo "   dig 3d.itsoa.io.vn"
echo ""
echo "2. Check Cloudflare SSL/TLS settings:"
echo "   - Go to Cloudflare Dashboard > SSL/TLS > Overview"
echo "   - Set SSL/TLS encryption mode to 'Full (strict)'"
echo "   - Enable 'Always Use HTTPS'"
echo ""
echo "3. Test external access:"
echo "   curl -I https://3d.itsoa.io.vn/health"
echo ""
echo "4. Monitor logs:"
echo "   docker compose logs -f"
echo ""
echo "5. Run connectivity debug:"
echo "   bash debug-connectivity.sh"

echo -e "\n✅ Quick fix completed!"