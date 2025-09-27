#!/bin/bash

echo "🚨 Emergency Fix for Cloudflare Error 521"
echo "======================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root: sudo bash emergency-fix.sh"
    exit 1
fi

echo "🔧 Applying emergency fixes..."

# 1. Open Google Cloud Firewall (most common issue)
echo "🔥 Opening Google Cloud Firewall rules..."
gcloud compute firewall-rules create allow-http-glb --allow tcp:80 --source-ranges 0.0.0.0/0 --description "GLB Renderer HTTP" 2>/dev/null && echo "  HTTP rule created ✅" || echo "  HTTP rule exists or failed ⚠️"
gcloud compute firewall-rules create allow-https-glb --allow tcp:443 --source-ranges 0.0.0.0/0 --description "GLB Renderer HTTPS" 2>/dev/null && echo "  HTTPS rule created ✅" || echo "  HTTPS rule exists or failed ⚠️"

# 2. Open local firewall
echo "🛡️  Configuring local firewall..."
if command -v ufw >/dev/null 2>&1; then
    ufw allow 80/tcp >/dev/null 2>&1 && echo "  UFW HTTP opened ✅" || echo "  UFW HTTP failed ⚠️"
    ufw allow 443/tcp >/dev/null 2>&1 && echo "  UFW HTTPS opened ✅" || echo "  UFW HTTPS failed ⚠️"
elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port=80/tcp >/dev/null 2>&1 && echo "  Firewalld HTTP opened ✅" || echo "  Firewalld HTTP failed ⚠️"
    firewall-cmd --permanent --add-port=443/tcp >/dev/null 2>&1 && echo "  Firewalld HTTPS opened ✅" || echo "  Firewalld HTTPS failed ⚠️"
    firewall-cmd --reload >/dev/null 2>&1
fi

# 3. Restart Docker services
echo "🐳 Restarting Docker container..."
cd /home/RD/puppeteer-glb-renderer 2>/dev/null || cd /root/puppeteer-glb-renderer 2>/dev/null || {
    echo "❌ Cannot find project directory. Please run this from the project folder."
    exit 1
}

docker compose down >/dev/null 2>&1
sleep 5
docker compose up -d >/dev/null 2>&1 && echo "  Container restarted ✅" || echo "  Container restart failed ❌"

# 4. Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 15

# 5. Test local services
echo "🧪 Testing local services..."
if curl -s -m 5 http://localhost:80 >/dev/null 2>&1; then
    echo "  HTTP (80): ✅ Working"
else
    echo "  HTTP (80): ❌ Not working"
fi

if curl -s -k -m 5 https://localhost:443 >/dev/null 2>&1; then
    echo "  HTTPS (443): ✅ Working"
else
    echo "  HTTPS (443): ❌ Not working"
fi

if curl -s -m 5 http://localhost:3000/health >/dev/null 2>&1; then
    echo "  Node.js (3000): ✅ Working"
else
    echo "  Node.js (3000): ❌ Not working"
fi

# 6. Test external access
echo "🌍 Testing external access..."
sleep 5
EXTERNAL_TEST=$(curl -s -I -m 10 https://3d.itsoa.io.vn/health 2>&1)
if echo "$EXTERNAL_TEST" | grep -q "HTTP"; then
    echo "  External HTTPS: ✅ Working!"
    echo "  Response: $(echo "$EXTERNAL_TEST" | head -1)"
else
    echo "  External HTTPS: ❌ Still failing"
    
    # Additional debugging
    echo ""
    echo "🔍 Additional debugging info:"
    echo "  Current server IP: $(curl -s https://api.ipify.org 2>/dev/null || echo 'Unknown')"
    echo "  DNS resolution: $(dig +short 3d.itsoa.io.vn 2>/dev/null || echo 'Failed')"
    
    # Check if nginx is working inside container
    CONTAINER_ID=$(docker ps -q --filter name=glb-renderer)
    if [ -n "$CONTAINER_ID" ]; then
        echo "  Nginx test in container:"
        docker exec "$CONTAINER_ID" nginx -t 2>&1 | sed 's/^/    /'
        
        echo "  Container ports:"
        docker port "$CONTAINER_ID" | sed 's/^/    /'
    fi
fi

echo ""
echo "📋 Summary:"
echo "If external access still fails after this fix:"
echo "1. Wait 2-3 minutes for DNS/firewall propagation"
echo "2. Check Cloudflare DNS settings point to your server IP"
echo "3. Verify Cloudflare SSL mode is 'Full (strict)'"
echo "4. Run: bash quick-diagnosis.sh for detailed analysis"

echo ""
echo "✅ Emergency fix completed!"