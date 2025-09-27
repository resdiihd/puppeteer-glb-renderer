# Cloudflare + IP Whitelist Architecture

## 🔄 How It Works

```
End User (Company IPs) → Cloudflare → Your Server → Node.js App
116.105.225.199        Cloudflare     Nginx      GLB Renderer
113.176.195.214        IPs            Proxy      Application
```

## 🛡️ Security Layers

### **Layer 1: Nginx (Server Access Control)**
- Allows Cloudflare IP ranges to connect to server
- Blocks non-Cloudflare IPs from reaching server directly
- Handles SSL termination and reverse proxy

**Cloudflare IP Ranges Allowed:**
```
173.245.48.0/20, 103.21.244.0/22, 103.22.200.0/22, 103.31.4.0/22
141.101.64.0/18, 108.162.192.0/18, 190.93.240.0/20, 188.114.96.0/20
197.234.240.0/22, 198.41.128.0/17, 162.158.0.0/15, 104.16.0.0/13
104.24.0.0/14, 172.64.0.0/13, 131.0.72.0/22
```

### **Layer 2: Node.js App (End-User Access Control)**
- Reads `CF-Connecting-IP` header (real user IP)
- Allows only company IPs: `116.105.225.199, 113.176.195.214`
- Returns 403 error for unauthorized user IPs

## 🔍 Request Flow

1. **User from company IP** → Cloudflare → Server ✅
2. **User from other IP** → Cloudflare → Server → 403 Blocked ❌
3. **Direct connection** → Server → Blocked at Nginx ❌

## 🚀 Deployment Commands

```bash
# Pull latest changes
sudo git pull origin main

# Restart with Cloudflare support
sudo docker compose down
sudo docker compose up -d --build

# Verify setup
curl -I https://3d.itsoa.io.vn/health
```

## 🧪 Testing Access

### **From Allowed IPs (116.105.225.199, 113.176.195.214):**
```bash
curl https://3d.itsoa.io.vn/health
# Expected: HTTP 200 + health response
```

### **From Other IPs:**
```bash
curl https://3d.itsoa.io.vn/health  
# Expected: HTTP 403 + access denied message
```

## 🔧 Configuration Files

- **ssl-cloudflare.conf**: Nginx config with Cloudflare IP whitelist
- **ipWhitelist.js**: Node.js middleware for end-user IP control
- **.env.production**: `ALLOWED_IPS=116.105.225.199,113.176.195.214`

## 📊 Monitoring

Check access logs for IP filtering:
```bash
sudo docker compose logs -f | grep -E "(IP access|CF-Connecting-IP)"
```

## ✅ Benefits

1. **Cloudflare Features**: DDoS protection, CDN, SSL management
2. **IP Security**: Only company IPs can use the application
3. **Server Security**: Only Cloudflare can connect to server
4. **Monitoring**: Health checks work for uptime monitoring
5. **SSL Automation**: ACME challenges work through Cloudflare