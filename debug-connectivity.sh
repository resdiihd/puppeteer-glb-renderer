#!/bin/bash

# GLB Renderer SSL and Connectivity Debug Script
echo "🔍 GLB Renderer Connectivity Debug"
echo "=================================="

# Basic server info
echo "📋 Server Information:"
echo "  Date: $(date)"
echo "  Hostname: $(hostname)"
echo "  External IP: $(curl -s https://api.ipify.org 2>/dev/null || echo 'Unable to detect')"
echo "  Internal IP: $(ip route get 1.1.1.1 | awk '{print $7}' | head -1)"

# Check environment
echo -e "\n🌐 Environment Variables:"
echo "  DOMAIN: ${DOMAIN:-'Not set'}"
echo "  NODE_ENV: ${NODE_ENV:-'Not set'}"
echo "  ALLOWED_IPS: ${ALLOWED_IPS:-'Not set'}"

# Check services
echo -e "\n🚀 Service Status:"
echo "  Nginx: $(systemctl is-active nginx 2>/dev/null || echo 'Not running or not systemd')"
echo "  Docker: $(systemctl is-active docker 2>/dev/null || echo 'Not running or not systemd')"

# Check ports
echo -e "\n🔌 Port Status:"
netstat -tlnp 2>/dev/null | grep -E ':80|:443|:3000' | while read line; do
    echo "  $line"
done

# Check SSL certificates
echo -e "\n🔐 SSL Certificate Status:"
if [ -f "/etc/ssl/certs/3d.itsoa.io.vn.crt" ]; then
    echo "  Certificate exists: ✅"
    echo "  Certificate info:"
    openssl x509 -in /etc/ssl/certs/3d.itsoa.io.vn.crt -noout -text | grep -E "(Subject:|Issuer:|Not Before:|Not After:)" | sed 's/^/    /'
else
    echo "  Certificate exists: ❌"
fi

# Test local connectivity
echo -e "\n🧪 Local Connectivity Tests:"

# Test HTTP
if curl -s -m 5 http://localhost:80 >/dev/null 2>&1; then
    echo "  HTTP (port 80): ✅"
else
    echo "  HTTP (port 80): ❌"
fi

# Test HTTPS
if curl -s -k -m 5 https://localhost:443 >/dev/null 2>&1; then
    echo "  HTTPS (port 443): ✅"
else
    echo "  HTTPS (port 443): ❌"
fi

# Test Node.js app
if curl -s -m 5 http://localhost:3000/health >/dev/null 2>&1; then
    echo "  Node.js (port 3000): ✅"
    echo "  Health response: $(curl -s http://localhost:3000/health | jq -c . 2>/dev/null || echo 'Not JSON')"
else
    echo "  Node.js (port 3000): ❌"
fi

# Test external connectivity
echo -e "\n🌍 External Connectivity Tests:"

# Test domain resolution
DOMAIN_IP=$(dig +short 3d.itsoa.io.vn 2>/dev/null)
if [ -n "$DOMAIN_IP" ]; then
    echo "  DNS Resolution: ✅ ($DOMAIN_IP)"
else
    echo "  DNS Resolution: ❌"
fi

# Test external HTTPS
echo "  Testing external HTTPS..."
HTTPS_RESPONSE=$(curl -s -I -m 10 https://3d.itsoa.io.vn 2>&1)
if echo "$HTTPS_RESPONSE" | grep -q "HTTP"; then
    echo "  External HTTPS: ✅"
    echo "  Response headers:"
    echo "$HTTPS_RESPONSE" | head -5 | sed 's/^/    /'
else
    echo "  External HTTPS: ❌"
    echo "  Error: $HTTPS_RESPONSE" | head -3 | sed 's/^/    /'
fi

# Check Cloudflare connectivity
echo -e "\n☁️  Cloudflare Tests:"
CF_TEST=$(curl -s -H "CF-Connecting-IP: 116.105.225.199" -I https://3d.itsoa.io.vn 2>&1)
if echo "$CF_TEST" | grep -q "HTTP"; then
    echo "  Cloudflare connectivity: ✅"
else
    echo "  Cloudflare connectivity: ❌"
    echo "  Error: $(echo "$CF_TEST" | head -1)"
fi

# Check firewall
echo -e "\n🔥 Firewall Status:"
if command -v ufw >/dev/null 2>&1; then
    echo "  UFW Status: $(ufw status | head -1)"
    ufw status | grep -E "(80|443|3000)" | sed 's/^/    /'
elif command -v iptables >/dev/null 2>&1; then
    echo "  Iptables rules for ports 80, 443, 3000:"
    iptables -L INPUT -n | grep -E "(80|443|3000)" | sed 's/^/    /'
else
    echo "  No firewall detected or accessible"
fi

# Container logs if in Docker
if [ -f "/.dockerenv" ]; then
    echo -e "\n🐳 Docker Container Info:"
    echo "  Running in Docker: ✅"
    echo "  Container ID: $(hostname)"
else
    echo -e "\n🐳 Docker Info:"
    echo "  Running in Docker: ❌"
fi

echo -e "\n📊 Summary:"
echo "If external HTTPS is failing, check:"
echo "  1. DNS: Ensure 3d.itsoa.io.vn points to your server IP"
echo "  2. Firewall: Ensure ports 80, 443 are open"
echo "  3. Cloudflare: Check SSL/TLS settings in Cloudflare dashboard"
echo "  4. Certificate: Ensure SSL certificate is valid and trusted"