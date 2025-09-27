#!/bin/bash

echo "🔍 Quick Cloudflare Error 521 Diagnosis"
echo "======================================"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "✅ Running as root"
else
    echo "⚠️  Not running as root - some checks may fail"
fi

# 1. Check basic connectivity
echo -e "\n🌐 Basic Connectivity Tests:"
echo "External IP: $(curl -s https://api.ipify.org 2>/dev/null || echo 'Unable to detect')"

# 2. Check local services
echo -e "\n🚀 Local Service Status:"
if curl -s -m 5 http://localhost:80 >/dev/null 2>&1; then
    echo "  HTTP (port 80): ✅ Working"
else
    echo "  HTTP (port 80): ❌ Not responding"
fi

if curl -s -k -m 5 https://localhost:443 >/dev/null 2>&1; then
    echo "  HTTPS (port 443): ✅ Working"
    echo "  HTTPS Response: $(curl -s -k -I https://localhost:443 | head -1)"
else
    echo "  HTTPS (port 443): ❌ Not responding"
fi

if curl -s -m 5 http://localhost:3000/health >/dev/null 2>&1; then
    echo "  Node.js (port 3000): ✅ Working"
    echo "  Health Response: $(curl -s http://localhost:3000/health)"
else
    echo "  Node.js (port 3000): ❌ Not responding"
fi

# 3. Check Docker container
echo -e "\n🐳 Docker Status:"
if command -v docker >/dev/null 2>&1; then
    echo "  Docker installed: ✅"
    if docker ps | grep -q glb-renderer; then
        echo "  Container running: ✅"
        echo "  Container status:"
        docker ps | grep glb-renderer | sed 's/^/    /'
    else
        echo "  Container running: ❌"
        echo "  Available containers:"
        docker ps -a | sed 's/^/    /'
    fi
else
    echo "  Docker not found: ❌"
fi

# 4. Check ports
echo -e "\n🔌 Port Status:"
netstat -tlnp 2>/dev/null | grep -E ':80|:443|:3000' || echo "  No processes found on ports 80, 443, 3000"

# 5. Check firewall - Google Cloud specific
echo -e "\n🔥 Firewall Status:"

# Check local firewall
if command -v ufw >/dev/null 2>&1; then
    echo "  UFW Status:"
    ufw status | head -10 | sed 's/^/    /'
elif command -v firewall-cmd >/dev/null 2>&1; then
    echo "  Firewalld Status:"
    firewall-cmd --list-ports 2>/dev/null | sed 's/^/    /' || echo "    Not active or accessible"
else
    echo "  No local firewall detected"
fi

# Check Google Cloud firewall
if command -v gcloud >/dev/null 2>&1; then
    echo "  Google Cloud Firewall Rules:"
    gcloud compute firewall-rules list --filter="name~'.*http.*' OR name~'.*80.*' OR name~'.*443.*'" --format="table(name,direction,allowed[].ports)" 2>/dev/null | sed 's/^/    /' || echo "    Unable to query GCP firewall"
else
    echo "  gcloud CLI not installed"
fi

# 6. SSL Certificate check
echo -e "\n🔐 SSL Certificate Status:"
if [ -f "/etc/ssl/certs/3d.itsoa.io.vn.crt" ]; then
    echo "  Certificate file exists: ✅"
    echo "  Certificate details:"
    openssl x509 -in /etc/ssl/certs/3d.itsoa.io.vn.crt -noout -subject -issuer -dates 2>/dev/null | sed 's/^/    /' || echo "    Unable to read certificate"
else
    echo "  Certificate file exists: ❌"
fi

# 7. DNS Resolution
echo -e "\n🌍 DNS Resolution:"
DOMAIN_IP=$(dig +short 3d.itsoa.io.vn 2>/dev/null)
if [ -n "$DOMAIN_IP" ]; then
    echo "  3d.itsoa.io.vn resolves to: $DOMAIN_IP"
    
    # Check if it matches current server IP
    CURRENT_IP=$(curl -s https://api.ipify.org 2>/dev/null)
    if [ "$DOMAIN_IP" = "$CURRENT_IP" ]; then
        echo "  DNS points to current server: ✅"
    else
        echo "  DNS points to current server: ❌ (Current: $CURRENT_IP, DNS: $DOMAIN_IP)"
    fi
else
    echo "  3d.itsoa.io.vn DNS resolution: ❌ Failed"
fi

# 8. Immediate fixes
echo -e "\n🔧 Immediate Fix Commands:"
echo "Run these commands to fix common issues:"
echo ""
echo "1. Open Google Cloud Firewall:"
echo "   gcloud compute firewall-rules create allow-http --allow tcp:80 --source-ranges 0.0.0.0/0"
echo "   gcloud compute firewall-rules create allow-https --allow tcp:443 --source-ranges 0.0.0.0/0"
echo ""
echo "2. Restart Docker container:"
echo "   sudo docker compose down && sudo docker compose up -d"
echo ""
echo "3. Check nginx configuration:"
echo "   sudo docker exec -it \$(docker ps -q --filter name=glb-renderer) nginx -t"
echo ""
echo "4. View container logs:"
echo "   sudo docker compose logs -f"

echo -e "\n📋 Next Steps:"
echo "1. If ports 80/443 are not responding locally, restart the container"
echo "2. If DNS doesn't match your server IP, update Cloudflare DNS"
echo "3. If firewall rules are missing, run the gcloud commands above"
echo "4. Check container logs for specific errors"